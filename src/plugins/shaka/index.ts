import type {
    IPlayer,
    PluginAPI,
    PlayerPluginInstance,
    PluginManifest,
    QualityPlugin,
    QualityLevel,
    AudioTrackPlugin,
    AudioTrack,
    TextTrack,
    TextTrackPlugin,
} from "../../types";

export interface ShakaPlayerOptions {
    shakaConfig?: Record<string, unknown>;
    shaka?: unknown;
}

export function createShakaPlugin(options: ShakaPlayerOptions = {}): PluginManifest {
    return {
        name: "shaka-plugin",
        version: "1.0.0",
        description: "HLS/DASH playback support using Shaka Player",
        factory: (player: IPlayer, api: PluginAPI) => {
            return new ShakaPlugin(player, api, options);
        },
    };
}

class ShakaPlugin implements PlayerPluginInstance {
    private shakaInstance: unknown = null;
    private shakaModule: unknown = null;
    private qualityCallback: ((level: QualityLevel) => void) | null = null;
    private audioTrackCallback: ((track: AudioTrack) => void) | null = null;
    private textTrackCallback: ((track: TextTrack | null) => void) | null = null;
    private cleanupListeners: (() => void)[] = [];
    private currentTextTracks: TextTrack[] = [];

    constructor(
        private player: IPlayer,
        private api: PluginAPI,
        private options: ShakaPlayerOptions,
    ) {
    }

    async install() {
        let shakaModule = this.options.shaka;

        if (!shakaModule && typeof window !== 'undefined' && (window as any).shaka) {
            shakaModule = (window as any).shaka;
        }

        if (!shakaModule) {
            try {
                const mod = await import(/* @vite-ignore */ "shaka-player" as string);
                shakaModule = (mod as any).default || mod;
                console.log("Shaka Plugin: Auto-imported shaka-player");
            } catch (e) {
                console.warn("Shaka Plugin: shaka-player not available. Install it with: npm install shaka-player");
            }
        }

        this.shakaModule = shakaModule || null;

        if (!shakaModule) {
            console.warn("Shaka Plugin: No shaka-player available");
            return;
        }

        const shaka = shakaModule as any;
        shaka.polyfill.installAll();

        if (!shaka.Player.isBrowserSupported()) {
            console.warn("Shaka Plugin: Browser not supported");
            return;
        }

        const video = this.player.media as HTMLVideoElement;

        this.shakaInstance = new shaka.Player();
        (this.shakaInstance as any).attach(video);

        if (this.options.shakaConfig) {
            (this.shakaInstance as any).configure(this.options.shakaConfig);
        }

        (this.shakaInstance as any).addEventListener('error', (event: any) => {
            console.error("Shaka Error:", event.detail);
        });

        this.setupQualityProvider();
        this.setupAudioTrackProvider();
        this.setupTextTrackProvider();

        const removeListener = this.player.on("sourcechange", (url: string) => {
            if (this.shakaInstance) {
                console.log("Shaka: Loading source", url);
                (this.shakaInstance as any).load(url).catch((error: any) => {
                    console.error("Shaka: Load error", error);
                });
            }
        });
        this.cleanupListeners.push(removeListener);

        const currentSrc = this.player.currentSource || video.src;
        if (currentSrc && (currentSrc.includes(".m3u8") || currentSrc.includes(".mpd"))) {
            (this.shakaInstance as any).load(currentSrc).catch((error: any) => {
                console.error("Shaka: Initial load error", error);
            });
        }
    }

    private setupQualityProvider() {
        const provider: QualityPlugin = {
            getAvailableQualities: () => {
                if (!this.shakaInstance) return [];
                const tracks = (this.shakaInstance as any).getVariantTracks() as any[];
                const qualities: Map<number, QualityLevel> = new Map();

                tracks.forEach((track: any) => {
                    if (track.height && !qualities.has(track.height)) {
                        qualities.set(track.height, {
                            id: track.height,
                            label: `${track.height}p`,
                            bitrate: track.bandwidth,
                            width: track.width,
                            height: track.height,
                            codec: track.videoCodec,
                        });
                    }
                });

                return [{ id: -1, label: "Auto" }, ...Array.from(qualities.values())];
            },
            getCurrentQuality: () => {
                return this.getCurrentQuality();
            },
            setQuality: (levelId: string | number) => {
                if (!this.shakaInstance) return;
                const id = Number(levelId);
                if (id === -1) {
                    (this.shakaInstance as any).configure({ abr: { enabled: true } });
                } else {
                    (this.shakaInstance as any).configure({ abr: { enabled: false } });
                    const tracks = (this.shakaInstance as any).getVariantTracks() as any[];
                    const selected = tracks.find((t: any) => t.height === id);
                    if (selected) {
                        (this.shakaInstance as any).selectVariantTrack(selected, true);
                    }
                }
            },
            onQualityChange: (callback) => {
                this.qualityCallback = callback;
            }
        };
        this.api.registerQualityProvider(provider);

        if (this.shakaInstance) {
            const video = this.player.media as HTMLVideoElement;
            video.addEventListener('adaptation', () => {
                if (this.qualityCallback) {
                    const current = this.getCurrentQuality();
                    if (current) this.qualityCallback(current);
                }
            });
        }
    }

    private setupAudioTrackProvider() {
        const provider: AudioTrackPlugin = {
            getAudioTracks: () => {
                if (!this.shakaInstance) return [];
                const tracks = (this.shakaInstance as any).getVariantTracks() as any[];
                const audioMap: Map<string, AudioTrack> = new Map();

                tracks.forEach((track: any) => {
                    if (track.language) {
                        const key = track.language;
                        if (!audioMap.has(key)) {
                            audioMap.set(key, {
                                id: key,
                                label: track.label || track.language,
                                language: track.language,
                                enabled: track.active,
                            });
                        }
                    }
                });

                return Array.from(audioMap.values());
            },
            setActiveTrack: (trackId: string) => {
                if (!this.shakaInstance) return;
                const tracks = (this.shakaInstance as any).getVariantTracks() as any[];
                const selected = tracks.find((t: any) => t.language === trackId);
                if (selected) {
                    (this.shakaInstance as any).selectVariantTrack(selected, true);
                }
            },
            getActiveTrack: () => {
                if (!this.shakaInstance) return null;
                const tracks = (this.shakaInstance as any).getVariantTracks() as any[];
                const active = tracks.find((t: any) => t.active && t.language);
                if (!active) return null;
                return {
                    id: active.language,
                    label: active.label || active.language,
                    language: active.language,
                    enabled: true,
                };
            },
            onAudioTrackChange: (callback) => {
                this.audioTrackCallback = callback;
            },
        };

        this.api.registerAudioTrackProvider(provider);

        if (this.shakaInstance) {
            (this.shakaInstance as any).addEventListener('variantchanged', () => {
                if (this.audioTrackCallback) {
                    const track = provider.getActiveTrack();
                    if (track) this.audioTrackCallback(track);
                }
                if (this.qualityCallback) {
                    const current = this.getCurrentQuality();
                    if (current) this.qualityCallback(current);
                }
            });
        }
    }

    private setupTextTrackProvider() {
        const provider: TextTrackPlugin = {
            getTextTracks: () => {
                if (!this.shakaInstance) return [];
                const tracks = (this.shakaInstance as any).getTextTracks() as any[];
                this.currentTextTracks = tracks.map((track: any, index: number) => ({
                    id: String(track.id || index),
                    label: track.label || track.language || `Subtitle ${index}`,
                    language: track.language || 'unknown',
                    kind: track.kind as TextTrack['kind'] || 'subtitles',
                    active: track.active,
                }));
                return this.currentTextTracks;
            },
            addTrack: (track) => {
                if (!this.shakaInstance || !track.src) return "";
                (this.shakaInstance as any).addTextTrack(track.src, track.label, track.language, track.kind);
                return track.id || "";
            },
            removeTrack: (trackId: string) => {
                if (!this.shakaInstance) return;
                const tracks = (this.shakaInstance as any).getTextTracks() as any[];
                const track = tracks.find((t: any) => String(t.id) === trackId);
                if (track) {
                    (this.shakaInstance as any).removeTextTrack(track);
                }
            },
            setActiveTrack: (trackId: string | null) => {
                if (!this.shakaInstance) return;
                const tracks = (this.shakaInstance as any).getTextTracks() as any[];
                if (trackId === null) {
                    (this.shakaInstance as any).setTextTrackVisibility(false);
                } else {
                    const track = tracks.find((t: any) => String(t.id) === trackId);
                    if (track) {
                        (this.shakaInstance as any).selectTextTrack(track);
                        (this.shakaInstance as any).setTextTrackVisibility(true);
                    }
                }
            },
            getActiveTrack: () => {
                if (!this.shakaInstance) return null;
                const tracks = (this.shakaInstance as any).getTextTracks() as any[];
                const active = tracks.find((t: any) => t.active);
                if (!active) return null;
                return {
                    id: String(active.id),
                    label: active.label || active.language || 'Subtitle',
                    language: active.language || 'unknown',
                    kind: active.kind as TextTrack['kind'] || 'subtitles',
                    active: true,
                };
            },
            onTextTrackChange: (callback) => {
                this.textTrackCallback = callback;
            }
        };

        this.api.registerTextTrackProvider(provider);

        if (this.shakaInstance) {
            (this.shakaInstance as any).addEventListener('textchanged', () => {
                if (this.textTrackCallback) {
                    const track = provider.getActiveTrack();
                    this.textTrackCallback(track);
                }
            });

            (this.shakaInstance as any).addEventListener('texttrackvisibility', () => {
                if (this.textTrackCallback) {
                    const track = provider.getActiveTrack();
                    this.textTrackCallback(track);
                }
            });
        }
    }

    private getCurrentQuality(): QualityLevel | null {
        if (!this.shakaInstance) return null;
        const tracks = (this.shakaInstance as any).getVariantTracks() as any[];
        const active = tracks.find((t: any) => t.active);
        if (!active) return { id: -1, label: "Auto" };

        return {
            id: active.height || -1,
            label: active.height ? `${active.height}p` : "Auto",
            bitrate: active.bandwidth,
            width: active.width,
            height: active.height,
            codec: active.videoCodec,
        };
    }

    dispose() {
        this.cleanupListeners.forEach((fn) => fn());
        this.cleanupListeners = [];
        if (this.shakaInstance) {
            (this.shakaInstance as any).destroy();
            this.shakaInstance = null;
        }
    }
}
