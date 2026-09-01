import type Hls from "hls.js";
import type { HlsConfig } from "hls.js";
import type {
    IPlayer,
    PluginAPI,
    PlayerPluginInstance,
    PluginManifest,
    QualityPlugin,
    QualityLevel,
    AudioTrackPlugin,
    AudioTrack,
    TextTrackPlugin,
    TextTrack,
} from "../../types";
import { isHlsUrl } from "../../utils/media";

export interface HlsPluginOptions {
    hlsConfig?: Partial<HlsConfig>;
    hls?: typeof Hls;
}

export function createHlsPlugin(options: HlsPluginOptions = {}): PluginManifest {
    return {
        name: "hls-plugin",
        version: "1.0.0",
        description: "HLS playback support using hls.js",
        factory: (player: IPlayer, api: PluginAPI) => {
            return new HlsPlugin(player, api, options);
        },
    };
}

class HlsPlugin implements PlayerPluginInstance {
    private hlsInstance: Hls | null = null;
    private HlsClass: typeof Hls | null = null;
    private qualityCallback: ((level: QualityLevel) => void) | null = null;
    private audioTrackCallback: ((track: AudioTrack) => void) | null = null;
    private cleanupListeners: (() => void)[] = [];

    constructor(
        private player: IPlayer,
        private api: PluginAPI,
        private options: HlsPluginOptions,
    ) {
    }

    async install() {
        // Attempt to locate Hls constructor
        // 1. Injected via options
        // 2. Global window.Hls
        // 3. Dynamic import from 'hls.js' (works in all bundlers/browsers)
        let HlsClass = this.options.hls;

        if (!HlsClass && typeof window !== 'undefined' && (window as any).Hls) {
            HlsClass = (window as any).Hls as typeof Hls;
        }

        // Auto-import hls.js if not provided via options or window global
        if (!HlsClass) {
            try {
                const hlsModule = await import("hls.js");
                HlsClass = hlsModule.default || hlsModule;
                console.log("HLS Plugin: Auto-imported hls.js");
            } catch (e) {
                console.warn("HLS Plugin: hls.js not available. Install it with: npm install hls.js");
            }
        }

        this.HlsClass = HlsClass || null;
        const video = this.player.media as HTMLVideoElement;

        // Check if we should use hls.js
        if (HlsClass && HlsClass.isSupported()) {
            console.log("HLS Plugin: Hls is supported, creating instance");
            this.hlsInstance = new HlsClass(this.options.hlsConfig);
            this.setupQualityProvider();
            this.setupAudioTrackProvider();
            this.setupTextTrackProvider();

            // Handle HLS events
            this.hlsInstance!.on(HlsClass.Events.MANIFEST_PARSED, (_event, data) => {
                console.log("HLS: Manifest parsed", data);
                // Trigger quality update
                if (this.qualityCallback) {
                    const current = this.getCurrentQuality();
                    if (current) this.qualityCallback(current);
                }
            });

            this.hlsInstance!.on(HlsClass.Events.ERROR, (_event, data) => {
                console.error("HLS Error:", data);
            });

            this.hlsInstance!.on(HlsClass.Events.LEVEL_SWITCHED, () => {
                if (this.qualityCallback) {
                    const current = this.getCurrentQuality();
                    if (current) this.qualityCallback(current);
                }
            });

            // Handle source changes from the player
            const removeListener = this.player.on("sourcechange", (url: string) => {
                if (isHlsUrl(url)) {
                    if (this.hlsInstance) {
                        console.log("HLS: Loading source", url);

                        // Detach from any previous source first to ensure clean state
                        this.hlsInstance.detachMedia();

                        // Clear any native src to avoid Firefox "not suitable" errors
                        if (video.src) {
                            video.removeAttribute('src');
                            video.load();
                        }

                        this.hlsInstance.attachMedia(video);
                        this.hlsInstance.loadSource(url);
                    }
                } else {
                    if (this.hlsInstance) {
                        this.hlsInstance.detachMedia();
                    }
                }
            });
            this.cleanupListeners.push(removeListener);

            // Initial check for already set source
            const currentSrc = this.player.currentSource || video.src;
            if (isHlsUrl(currentSrc)) {
                if (video.src) {
                    video.removeAttribute('src');
                    video.load();
                }
                this.hlsInstance!.attachMedia(video);
                this.hlsInstance!.loadSource(currentSrc);
            }
        } else if (
            video.canPlayType("application/vnd.apple.mpegurl")
        ) {
            // Native HLS support (Safari)
            console.log("Using native HLS support");
        } else {
            console.warn("HLS Plugin: No HLS support available (hls.js not found and no native support)");
        }
    }

    private setupQualityProvider() {
        const provider: QualityPlugin = {
            getAvailableQualities: () => {
                if (!this.hlsInstance) return [];
                return this.hlsInstance.levels.map((level: any, index: number) => ({
                    id: index,
                    label: level.height ? `${level.height}p` : `Level ${index}`,
                    bitrate: level.bitrate,
                    width: level.width,
                    height: level.height,
                    codec: level.videoCodec,
                }));
            },
            getCurrentQuality: () => {
                return this.getCurrentQuality();
            },
            setQuality: (levelId: string | number) => {
                if (!this.hlsInstance) return;
                this.hlsInstance.currentLevel = Number(levelId);
            },
            onQualityChange: (callback) => {
                this.qualityCallback = callback;
            }
        };
        this.api.registerQualityProvider(provider);
    }

    private setupAudioTrackProvider() {
        const provider: AudioTrackPlugin = {
            getAudioTracks: () => {
                if (!this.hlsInstance) return [];
                return this.hlsInstance!.audioTracks.map((track, index: number) => ({
                    id: String(track.id || index),
                    label: track.name || track.lang || `Track ${index}`,
                    language: track.lang || 'unknown',
                    enabled: this.hlsInstance ? this.hlsInstance.audioTrack === index : false
                }));
            },
            setActiveTrack: (trackId: string) => {
                if (!this.hlsInstance) return;
                this.hlsInstance.audioTrack = Number(trackId);
            },
            getActiveTrack: () => {
                if (!this.hlsInstance) return null;
                const index = this.hlsInstance.audioTrack;
                if (index === -1) return null;
                const track = this.hlsInstance.audioTracks[index];
                if (!track) return null;
                return {
                    id: String(track.id || index),
                    label: track.name || track.lang || `Track ${index}`,
                    language: track.lang || 'unknown',
                    enabled: true
                };
            },
            onAudioTrackChange: (callback) => {
                this.audioTrackCallback = callback;
            },
        };

        this.api.registerAudioTrackProvider(provider);

        // Listen for changes
        if (this.hlsInstance) {
            const HlsClass = this.HlsClass;
            this.hlsInstance.on(HlsClass!.Events.AUDIO_TRACK_SWITCHED, () => {
                if (this.audioTrackCallback) {
                    const track = provider.getActiveTrack();
                    if (track) this.audioTrackCallback(track);
                }
            });
        }
    }
    private setupTextTrackProvider() {
        const provider: TextTrackPlugin = {
            getTextTracks: () => {
                if (!this.hlsInstance) return [];
                return this.hlsInstance.subtitleTracks.map((track, index: number) => ({
                    id: String(index),
                    label: track.name || track.lang || `Subtitle ${index}`,
                    language: track.lang || 'unknown',
                    kind: 'subtitles',
                    active: this.hlsInstance ? this.hlsInstance.subtitleTrack === index : false
                }));
            },
            addTrack: () => {
                // hls.js owns the track list coming from the manifest; external
                // tracks belong to a dedicated text-track plugin instead.
                console.warn("HLS Plugin: addTrack() is not supported for manifest-driven subtitle tracks");
                return "";
            },
            removeTrack: () => {
                console.warn("HLS Plugin: removeTrack() is not supported for manifest-driven subtitle tracks");
            },
            setActiveTrack: (trackId: string | null) => {
                if (!this.hlsInstance) return;
                this.hlsInstance.subtitleTrack = trackId === null ? -1 : Number(trackId);
            },
            getActiveTrack: () => {
                if (!this.hlsInstance) return null;
                const index = this.hlsInstance.subtitleTrack;
                if (index === -1) return null;
                const track = this.hlsInstance.subtitleTracks[index];
                if (!track) return null;
                return {
                    id: String(index),
                    label: track.name || track.lang || `Subtitle ${index}`,
                    language: track.lang || 'unknown',
                    kind: 'subtitles',
                    active: true
                };
            },
            onTextTrackChange: (callback) => {
                this.textTrackCallback = callback;
            }
        };

        // Registered and wired only after `provider` exists: the handlers below
        // used to close over it before its declaration.
        this.api.registerTextTrackProvider(provider);

        const HlsClass = this.HlsClass;
        if (this.hlsInstance && HlsClass) {
            this.hlsInstance.on(HlsClass.Events.SUBTITLE_TRACK_SWITCH, () => {
                this.textTrackCallback?.(provider.getActiveTrack());
            });
        }
    }

    private textTrackCallback: ((track: TextTrack | null) => void) | null = null;


    // Helper to get current quality level object
    private getCurrentQuality(): QualityLevel | null {
        if (!this.hlsInstance) return null;
        if (this.hlsInstance.autoLevelEnabled) {
            return { id: -1, label: "Auto" };
        }
        const index = this.hlsInstance.currentLevel;
        if (index >= 0 && index < this.hlsInstance.levels.length) {
            const level = this.hlsInstance.levels[index];
            return {
                id: index,
                label: level.height ? `${level.height}p` : `Level ${index}`,
                bitrate: level.bitrate,
                width: level.width,
                height: level.height,
                codec: level.videoCodec,
            };
        }
        return null;
    }

    dispose() {
        this.cleanupListeners.forEach((fn) => fn());
        this.cleanupListeners = [];
        if (this.hlsInstance) {
            this.hlsInstance.destroy();
            this.hlsInstance = null;
        }
        this.qualityCallback = null;
        this.audioTrackCallback = null;
        this.textTrackCallback = null;
    }
}
