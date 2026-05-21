import type shaka from "shaka-player/dist/shaka-player.compiled";
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
    shakaConfig?: Partial<shaka.extern.PlayerConfiguration>;
    shaka?: typeof shaka;
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

type ShakaTrack = shaka.extern.Track;
type ShakaTextTrack = shaka.extern.TextTrack;
type ShakaError = shaka.util.Error;

class ShakaPlugin implements PlayerPluginInstance {
    private shakaInstance: shaka.Player | null = null;
    private shakaModule: typeof shaka | null = null;
    private qualityCallback: ((level: QualityLevel) => void) | null = null;
    private audioTrackCallback: ((track: AudioTrack) => void) | null = null;
    private textTrackCallback: ((track: TextTrack | null) => void) | null = null;
    private cleanupListeners: (() => void)[] = [];

    constructor(
        private player: IPlayer,
        private api: PluginAPI,
        private options: ShakaPlayerOptions,
    ) {
    }

    async install() {
        let shakaModule = this.options.shaka;

        if (!shakaModule && typeof window !== "undefined") {
            const globalWindow = window as typeof window & { shaka?: typeof shaka };
            if (globalWindow.shaka) {
                shakaModule = globalWindow.shaka;
            }
        }

        if (!shakaModule) {
            try {
                const mod = await import("shaka-player/dist/shaka-player.compiled" as string);
                shakaModule = (mod as { default?: typeof shaka }).default ?? mod;
                console.log("Shaka Plugin: Auto-imported shaka-player");
            } catch (e) {
                console.warn("Shaka Plugin: shaka-player not available. Install it with: npm install shaka-player");
            }
        }

        this.shakaModule = shakaModule ?? null;

        if (!shakaModule) {
            console.warn("Shaka Plugin: No shaka-player available");
            return;
        }

        shakaModule.polyfill.installAll();

        if (!shakaModule.Player.isBrowserSupported()) {
            console.warn("Shaka Plugin: Browser not supported");
            return;
        }

        const video = this.player.media as HTMLVideoElement;

        this.shakaInstance = new shakaModule.Player();
        this.shakaInstance.attach(video);

        if (this.options.shakaConfig) {
            this.shakaInstance.configure(this.options.shakaConfig);
        }

        this.shakaInstance.addEventListener("error", (event: Event) => {
            const shakaEvent = event as CustomEvent<ShakaError>;
            console.error("Shaka Error:", shakaEvent.detail);
        });

        this.setupQualityProvider();
        this.setupAudioTrackProvider();
        this.setupTextTrackProvider();

        const removeListener = this.player.on("sourcechange", (url: string) => {
            if (this.shakaInstance) {
                console.log("Shaka: Loading source", url);
                this.shakaInstance.load(url).catch((error: unknown) => {
                    console.error("Shaka: Load error", error);
                });
            }
        });
        this.cleanupListeners.push(removeListener);

        const currentSrc = this.player.currentSource || video.src;
        if (currentSrc && (currentSrc.includes(".m3u8") || currentSrc.includes(".mpd"))) {
            this.shakaInstance.load(currentSrc).catch((error: unknown) => {
                console.error("Shaka: Initial load error", error);
            });
        }
    }

    private setupQualityProvider() {
        const provider: QualityPlugin = {
            getAvailableQualities: () => {
                if (!this.shakaInstance) return [];
                const tracks = this.shakaInstance.getVariantTracks();
                const qualities: Map<number, QualityLevel> = new Map();

                tracks.forEach((track: ShakaTrack) => {
                    if (track.height && !qualities.has(track.height)) {
                        qualities.set(track.height, {
                            id: track.height,
                            label: `${track.height}p`,
                            bitrate: track.bandwidth,
                            width: track.width ?? 0,
                            height: track.height,
                            codec: track.videoCodec ?? "",
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
                    this.shakaInstance.configure({ abr: { enabled: true } });
                } else {
                    this.shakaInstance.configure({ abr: { enabled: false } });
                    const tracks = this.shakaInstance.getVariantTracks();
                    const selected = tracks.find((t: ShakaTrack) => t.height === id);
                    if (selected) {
                        this.shakaInstance.selectVariantTrack(selected, true);
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
            video.addEventListener("adaptation", () => {
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
                const tracks = this.shakaInstance.getVariantTracks();
                const audioMap: Map<string, AudioTrack> = new Map();

                tracks.forEach((track: ShakaTrack) => {
                    if (track.language) {
                        const key = track.language;
                        if (!audioMap.has(key)) {
                            audioMap.set(key, {
                                id: key,
                                label: track.label ?? track.language,
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
                const tracks = this.shakaInstance.getVariantTracks();
                const selected = tracks.find((t: ShakaTrack) => t.language === trackId);
                if (selected) {
                    this.shakaInstance.selectVariantTrack(selected, true);
                }
            },
            getActiveTrack: () => {
                if (!this.shakaInstance) return null;
                const tracks = this.shakaInstance.getVariantTracks();
                const active = tracks.find((t: ShakaTrack) => t.active && t.language);
                if (!active) return null;
                return {
                    id: active.language,
                    label: active.label ?? active.language,
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
            this.shakaInstance.addEventListener("variantchanged", () => {
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
                const tracks = this.shakaInstance.getTextTracks();
                return tracks.map((track: ShakaTextTrack, index: number) => ({
                    id: String(track.id ?? index),
                    label: track.label ?? track.language ?? `Subtitle ${index}`,
                    language: track.language ?? "unknown",
                    kind: (track.kind ?? "subtitles") as TextTrack["kind"],
                    active: track.active,
                }));
            },
            addTrack: (track) => {
                if (!this.shakaInstance || !track.src) return "";
                this.shakaInstance.addTextTrackAsync(track.src, track.language, track.kind ?? "subtitles")
                    .catch((error: unknown) => {
                        console.error("Shaka: Failed to add text track", error);
                    });
                return track.id ?? "";
            },
            removeTrack: (_trackId: string) => {
                console.warn("Shaka: removeTextTrack is not supported by Shaka Player");
            },
            setActiveTrack: (trackId: string | null) => {
                if (!this.shakaInstance) return;
                const tracks = this.shakaInstance.getTextTracks();
                if (trackId === null) {
                    this.shakaInstance.setTextTrackVisibility(false);
                } else {
                    const track = tracks.find((t: ShakaTextTrack) => String(t.id) === trackId);
                    if (track) {
                        this.shakaInstance.selectTextTrack(track);
                        this.shakaInstance.setTextTrackVisibility(true);
                    }
                }
            },
            getActiveTrack: () => {
                if (!this.shakaInstance) return null;
                const tracks = this.shakaInstance.getTextTracks();
                const active = tracks.find((t: ShakaTextTrack) => t.active);
                if (!active) return null;
                return {
                    id: String(active.id),
                    label: active.label ?? active.language ?? "Subtitle",
                    language: active.language ?? "unknown",
                    kind: (active.kind ?? "subtitles") as TextTrack["kind"],
                    active: true,
                };
            },
            onTextTrackChange: (callback) => {
                this.textTrackCallback = callback;
            }
        };

        this.api.registerTextTrackProvider(provider);

        if (this.shakaInstance) {
            this.shakaInstance.addEventListener("textchanged", () => {
                if (this.textTrackCallback) {
                    const track = provider.getActiveTrack();
                    this.textTrackCallback(track);
                }
            });

            this.shakaInstance.addEventListener("texttrackvisibility", () => {
                if (this.textTrackCallback) {
                    const track = provider.getActiveTrack();
                    this.textTrackCallback(track);
                }
            });
        }
    }

    private getCurrentQuality(): QualityLevel | null {
        if (!this.shakaInstance) return null;
        const tracks = this.shakaInstance.getVariantTracks();
        const active = tracks.find((t: ShakaTrack) => t.active);
        if (!active) return { id: -1, label: "Auto" };

        return {
            id: active.height ?? -1,
            label: active.height ? `${active.height}p` : "Auto",
            bitrate: active.bandwidth,
            width: active.width ?? 0,
            height: active.height ?? 0,
            codec: active.videoCodec ?? "",
        };
    }

    dispose() {
        this.cleanupListeners.forEach((fn) => fn());
        this.cleanupListeners = [];
        if (this.shakaInstance) {
            this.shakaInstance.destroy();
            this.shakaInstance = null;
        }
    }
}
