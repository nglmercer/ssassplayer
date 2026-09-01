import type {
    IPlayer,
    PluginAPI,
    PlayerPluginInstance,
    PluginManifest,
    TextTrack
} from "../../types";

// Definimos la interfaz para las opciones del plugin
// JASSUB requiere ciertas URLs para los workers y wasm
export interface AssPluginOptions {
    fonts?: string[]; // Fuentes personalizadas a cargar
    workerUrl?: string; // URL del worker de JASSUB
    wasmUrl?: string; // URL del archivo WASM de JASSUB
    legacyWorkerUrl?: string; // Fallback para navegadores viejos
    [key: string]: any; // Allow other JASSUB options like availableFonts, fallbackFont, etc.
}

// Interfaz mínima para JASSUB (ya que es una librería externa)
interface JASSUBInstance {
    resize(width?: number, height?: number): void;
    setTrack(content: string): void;
    free(): void;
    destroy(): void;
}

// Declaramos la clase constructora global de JASSUB si se carga via script tag
declare global {
    interface Window {
        // Optional: consumers that never load JASSUB must not be forced to
        // declare it, and the plugin degrades gracefully when it is absent.
        JASSUB?: new (options: any) => JASSUBInstance;
    }
}

export function createAssPlugin(options: AssPluginOptions = {}): PluginManifest {
    return {
        name: "ass-plugin",
        version: "1.0.0",
        description: "Advanced SubStation Alpha (ASS/SSA) rendering support using JASSUB",
        factory: (player: IPlayer, api: PluginAPI) => {
            return new AssPlugin(player, api, options);
        },
    };
}

class AssPlugin implements PlayerPluginInstance {
    private jassub: JASSUBInstance | null = null;
    private tracks: TextTrack[] = [];
    private activeTrackId: string | null = null;
    private cleanupListeners: (() => void)[] = [];

    constructor(
        private player: IPlayer,
        private api: PluginAPI,
        private options: AssPluginOptions,
    ) { }

    install() {
        // Verificar si JASSUB está cargado (y que exista un DOM en absoluto)
        if (typeof window === 'undefined' || typeof window.JASSUB === 'undefined') {
            console.error("AssPlugin: JASSUB library not found. Please load it via script tag or import.");
            return;
        }

        // Registrar el proveedor de pistas de texto
        // Esto permite que el menú de configuración detecte y muestre las pistas ASS
        this.api.registerTextTrackProvider({
            getTextTracks: () => this.tracks,
            addTrack: (track) => {
                // Solo aceptamos pistas personalizadas con un contenido especial o URL
                // Por simplicidad, asumimos que 'src' en el track apunta al archivo .ass
                const newTrack = {
                    ...track,
                    id: track.id || `ass-${Date.now()}`,
                    kind: 'subtitles' as const
                };
                this.tracks.push(newTrack);
                return newTrack.id;
            },
            removeTrack: (trackId) => {
                this.tracks = this.tracks.filter(t => t.id !== trackId);
                if (this.activeTrackId === trackId) {
                    this.setActiveTrack(null);
                }
            },
            setActiveTrack: (trackId) => this.setActiveTrack(trackId),
            getActiveTrack: () => {
                return this.tracks.find(t => t.id === this.activeTrackId) || null;
            },
            onTextTrackChange: (cb) => {
                this.trackChangeCallback = cb;
            }
        });

        // Inicializar JASSUB
        this.initJassub();
    }

    private trackChangeCallback: ((track: TextTrack | null) => void) | null = null;
    private loadToken = 0;

    private initJassub() {
        const video = this.player.media as HTMLVideoElement;

        console.log("AssPlugin: Initializing JASSUB with options:", this.options);

        // JASSUB necesita las URLs de los workers.
        // Si no se proveen, JASSUB intentará adivinarlas o fallará dependiendo de la versión.
        try {
            const JASSUB = window.JASSUB!;
            // A minimal valid header, used only when the caller supplied neither
            // `subContent` nor `subUrl`; without it JASSUB reports
            // "Failed to start a track".
            const hasCallerTrack =
                this.options.subContent !== undefined || this.options.subUrl !== undefined;

            this.jassub = new JASSUB({
                video: video,
                // Defaults first, caller options last: spreading `this.options`
                // first meant the explicit keys below silently overwrote the
                // caller's own `subContent` with `undefined`.
                // Async rendering needs SharedArrayBuffer, i.e. a cross-origin
                // isolated document.
                asyncRender: window.crossOriginIsolated === true,
                // offscreenRender is forced off: combined with main-thread
                // resizing it triggers "Detached OffscreenCanvas" in some
                // JASSUB/browser combinations.
                offscreenRender: false,
                onDemandRender: true,
                targetFps: 60,
                ...(hasCallerTrack
                    ? {}
                    : { subContent: '[Script Info]\nScriptType: v4.00+\nPlayResX: 384\nPlayResY: 288' }),
                ...this.options,
            });

            // Handle Resize
            const resizeObserver = new ResizeObserver(() => {
                this.jassub?.resize();
            });
            resizeObserver.observe(video);
            this.cleanupListeners.push(() => resizeObserver.disconnect());
        } catch (e) {
            console.error("AssPlugin: Failed to initialize JASSUB", e);
        }
    }

    private async setActiveTrack(trackId: string | null) {
        this.activeTrackId = trackId;
        // Fetching a track is async; a newer call must win over an in-flight one.
        const token = ++this.loadToken;
        const track = this.tracks.find(t => t.id === trackId);

        if (this.trackChangeCallback) {
            this.trackChangeCallback(track || null);
        }

        if (!this.jassub) return;

        if (!track) {
            // Desactivar subtítulos (limpiar contenido)
            // JASSUB no tiene un método 'clear' explícito documentado siempre,
            // pero setTrack con string vacío suele funcionar
            try {
                this.jassub.setTrack("");
            } catch (e) {
                console.warn("AssPlugin: failed to clear the active track", e);
            }
            return;
        }

        // Cargar el contenido del archivo ASS
        // Ojo: track.src debería ser la URL del .ass
        if (track.src) {
            try {
                const response = await fetch(track.src);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} loading ${track.src}`);
                }
                const content = await response.text();
                if (token !== this.loadToken) return; // superseded
                this.jassub?.setTrack(content);
            } catch (e) {
                console.error("AssPlugin: Failed to load ASS track", e);
            }
        } else if (track.content) {
            // Si el contenido ya está en el objeto track
            this.jassub.setTrack(track.content);
        }
    }

    dispose() {
        // Invalidate any in-flight track fetch.
        this.loadToken++;
        if (this.jassub) {
            this.jassub.destroy();
            this.jassub = null;
        }
        this.cleanupListeners.forEach(fn => fn());
        this.cleanupListeners = [];
        this.tracks = [];
        this.activeTrackId = null;
        this.trackChangeCallback = null;
    }
}
