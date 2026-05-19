import { Emitter } from "./emitter";
import { VideoFrameExtractor, createFrameExtractor } from "./core";
import type {
  PlayerEvents,
  PlayerOptions,
  PlayerState,
  PluginAPI,
  PluginManifest,
  PlayerPluginInstance,
  QualityPlugin,
  TextTrackPlugin,
  AudioTrackPlugin,
  ThumbnailPlugin,
  MenuItem,
  IPlayer,
} from "./types";
import { PlayerEvent, MediaEvent } from "./types";
import { getParentByClass } from "./utils/dom";
export type PlayerPlugin = (player: Player) => void | { dispose(): void };

export class Player implements IPlayer {
  static readonly Event = PlayerEvent;

  get Event() {
    return PlayerEvent;
  }

  readonly media: HTMLMediaElement;
  readonly events: Emitter<PlayerEvents>;
  public currentSource?: string;
  private plugins: Array<{ dispose?: () => void }> = [];
  private pluginInstances = new Map<string, PlayerPluginInstance>();
  private ready = false;
  private pluginAPI!: PluginAPI;
  private container: HTMLElement;
  private frameExtractor: VideoFrameExtractor | null = null;

  constructor(options: PlayerOptions) {
    this.media = options.media;
    this.container = options.container || this.getPlayerContainer();
    this.container.classList.add("ap-player");

    // Set crossOrigin attribute if specified
    if (options.crossOrigin) {
      this.media.crossOrigin = options.crossOrigin;
    }

    if (options.volume !== undefined)
      this.media.volume = Math.max(0, Math.min(1, options.volume));
    if (options.muted !== undefined) this.media.muted = options.muted;
    if (options.playbackRate !== undefined)
      this.media.playbackRate = options.playbackRate;

    this.events = new Emitter<PlayerEvents>();
    this.setupPluginAPI();
    this.bind();

    if (options.autoplay) this.play();
  }

  private getPlayerContainer(): HTMLElement {
    const container = getParentByClass(this.media, ["player", "player-wrapper"], { stopAt: "BODY" });
    return (container as HTMLElement) || this.media.parentElement || this.media;
  }

  private setupPluginAPI(): void {
    const providers = {
      quality: null as QualityPlugin | null,
      textTrack: null as TextTrackPlugin | null,
      audioTrack: null as AudioTrackPlugin | null,
      thumbnail: null as ThumbnailPlugin | null,
    };

    this.pluginAPI = {
      registerQualityProvider: (plugin: QualityPlugin) => {
        providers.quality = plugin;
        plugin.onQualityChange?.((level) => {
          this.events.emit(PlayerEvent.QUALITY_CHANGE, level);
        });
      },
      registerTextTrackProvider: (plugin: TextTrackPlugin) => {
        providers.textTrack = plugin;
        plugin.onTextTrackChange?.((track) => {
          this.events.emit(PlayerEvent.TEXT_TRACK_CHANGE, track);
        });
      },
      registerAudioTrackProvider: (plugin: AudioTrackPlugin) => {
        providers.audioTrack = plugin;
        plugin.onAudioTrackChange?.((track) => {
          this.events.emit(PlayerEvent.AUDIO_PLAYER_CHANGE, track);
        });
      },
      registerThumbnailProvider: (plugin: ThumbnailPlugin) => {
        providers.thumbnail = plugin;
      },
      getQualityProvider: () => providers.quality,
      getTextTrackProvider: () => providers.textTrack,
      getAudioTrackProvider: () => providers.audioTrack,
      getThumbnailProvider: () => providers.thumbnail,
      addMenuItem: (item: MenuItem) => {
        this.events.emit(PlayerEvent.MENU_ITEM_ADDED, item);
      },
      removeMenuItem: (itemId: string) => {
        this.events.emit(PlayerEvent.MENU_ITEM_REMOVED, itemId);
      },
      getFrameExtractor: () => {
        if (!this.frameExtractor) {
          this.frameExtractor = createFrameExtractor(
            this.media as HTMLVideoElement,
          );
        }
        return this.frameExtractor;
      },
    };
  }

  private bind() {
    this.media.addEventListener(MediaEvent.LOADED_METADATA, () => {
      this.ready = true;
      this.events.emit(PlayerEvent.READY, this.media);
    });
    this.media.addEventListener(MediaEvent.LOADED_DATA, () => {
      if (!this.ready && this.media.duration) {
        this.ready = true;
        this.events.emit(PlayerEvent.READY, this.media);
      }
    });
    this.media.addEventListener(MediaEvent.CAN_PLAY, () => {
      if (!this.ready && this.media.duration) {
        this.ready = true;
        this.events.emit(PlayerEvent.READY, this.media);
      }
    });
    this.media.addEventListener(MediaEvent.PLAY, () => this.events.emit(PlayerEvent.PLAY));
    this.media.addEventListener(MediaEvent.PAUSE, () => this.events.emit(PlayerEvent.PAUSE));
    this.media.addEventListener(MediaEvent.TIME_UPDATE, () =>
      this.events.emit(
        PlayerEvent.TIME_UPDATE,
        this.media.currentTime,
        this.media.duration || 0,
      ),
    );
    this.media.addEventListener(MediaEvent.VOLUME_CHANGE, () =>
      this.events.emit(PlayerEvent.VOLUME_CHANGE, this.media.volume, this.media.muted),
    );
    this.media.addEventListener(MediaEvent.SEEKING, () =>
      this.events.emit(PlayerEvent.SEEKING, this.media.currentTime),
    );
    this.media.addEventListener(MediaEvent.SEEKED, () =>
      this.events.emit(PlayerEvent.SEEKED, this.media.currentTime),
    );
    this.media.addEventListener(MediaEvent.RATE_CHANGE, () =>
      this.events.emit(PlayerEvent.RATE_CHANGE, this.media.playbackRate),
    );
    this.media.addEventListener(MediaEvent.ERROR, (e) => {
      const error = this.media.error
        ? new Error(this.media.error.message)
        : new Error("media error");
      this.events.emit(PlayerEvent.ERROR, error);
    });
    this.media.addEventListener(MediaEvent.DURATION_CHANGE, () => {
      if (this.media.duration && this.media.duration > 0) {
        this.events.emit(PlayerEvent.DURATION_CHANGE, this.media.duration);
      }
    });
    this.media.addEventListener(MediaEvent.PROGRESS, () => {
      if (this.media.buffered.length > 0) {
        const bufferedEnd = this.media.buffered.end(
          this.media.buffered.length - 1,
        );
        this.events.emit(PlayerEvent.PROGRESS, bufferedEnd, this.media.duration || 0);
      }
    });
    this.media.addEventListener(MediaEvent.WAITING, () => this.events.emit(PlayerEvent.WAITING));
    this.media.addEventListener(MediaEvent.STALLED, () => this.events.emit(PlayerEvent.STALLED));
    this.media.addEventListener(MediaEvent.CAN_PLAY_THROUGH, () => this.events.emit(PlayerEvent.CAN_PLAY_THROUGH));
    this.media.addEventListener(MediaEvent.PLAYING, () => this.events.emit(PlayerEvent.PLAYING));
  }

  use(plugin: PlayerPlugin) {
    const res = plugin(this);
    if (
      res &&
      typeof res === "object" &&
      "dispose" in res &&
      typeof res.dispose === "function"
    )
      this.plugins.push({ dispose: res.dispose.bind(res) });
    else this.plugins.push({});
    return this;
  }

  // New plugin manifest system
  async usePlugin(manifest: PluginManifest): Promise<PlayerPluginInstance> {
    try {
      // Check dependencies
      if (manifest.dependencies) {
        for (const dep of manifest.dependencies) {
          if (!this.pluginInstances.has(dep)) {
            throw new Error(`Missing dependency: ${dep}`);
          }
        }
      }

      // Create and install plugin instance
      const instance = manifest.factory(this, this.pluginAPI);
      await instance.install();

      this.pluginInstances.set(manifest.name, instance);

      this.plugins.push({
        dispose: () => instance.dispose?.(),
      });

      return instance;
    } catch (error) {
      console.error(`Failed to load plugin ${manifest.name}:`, error);
      throw error;
    }
  }

  // Plugin access helpers
  getPlugin(name: string): PlayerPluginInstance | undefined {
    return this.pluginInstances.get(name);
  }

  hasPlugin(name: string): boolean {
    return this.pluginInstances.has(name);
  }

  on<K extends keyof PlayerEvents>(
    type: K,
    handler: (...args: PlayerEvents[K]) => void,
  ) {
    return this.events.on(type, handler);
  }
  once<K extends keyof PlayerEvents>(
    type: K,
    handler: (...args: PlayerEvents[K]) => void,
  ) {
    return this.events.once(type, handler);
  }
  off<K extends keyof PlayerEvents>(
    type: K,
    handler: (...args: PlayerEvents[K]) => void,
  ) {
    this.events.off(type, handler);
  }

  async play(): Promise<void> {
    try {
      if (!this.media.src && !this.media.srcObject && !this.hasPlugin("hls-plugin") && !this.hasPlugin("shaka-plugin")) {
        return;
      }
      await this.media.play();
    } catch (error) {
      console.warn("Playback failed or interrupted:", error);
      throw error;
    }
  }
  pause() {
    this.media.pause();
  }
  setVolume(v: number) {
    this.media.volume = Math.max(0, Math.min(1, v));
  }
  mute() {
    this.media.muted = true;
  }
  unmute() {
    this.media.muted = false;
  }
  setMuted(m: boolean) {
    this.media.muted = m;
  }
  seek(seconds: number) {
    const duration = this.media.duration || 0;
    this.media.currentTime = Math.max(0, Math.min(seconds, duration));
  }
  setRate(rate: number) {
    this.media.playbackRate = rate;
  }
  setSource(url: string) {
    const isHls = url.toLowerCase().split('?')[0].endsWith(".m3u8") || url.includes(".m3u8");
    const isDash = url.toLowerCase().split('?')[0].endsWith(".mpd") || url.includes(".mpd");
    const supportsNativeHls = !!this.media.canPlayType("application/vnd.apple.mpegurl");

    if ((isHls || isDash) && !supportsNativeHls && (this.hasPlugin("hls-plugin") || this.hasPlugin("shaka-plugin"))) {
      console.log("Player: Streaming format detected, deferring to plugin");
    } else {
      this.media.src = url;
      this.media.load();
    }

    this.currentSource = url;
    this.events.emit(PlayerEvent.SOURCE_CHANGE, url);
  }

  getState(): PlayerState {
    const qualityProvider = this.pluginAPI.getQualityProvider();
    const textTrackProvider = this.pluginAPI.getTextTrackProvider();
    const audioTrackProvider = this.pluginAPI.getAudioTrackProvider();

    return {
      duration: this.media.duration || 0,
      currentTime: this.media.currentTime || 0,
      volume: this.media.volume,
      muted: this.media.muted,
      playbackRate: this.media.playbackRate,
      paused: this.media.paused,
      ready: this.ready,
      fullscreen: !!document.fullscreenElement,
      pip: !!(document as Document & { pictureInPictureElement: Element | null }).pictureInPictureElement,
      quality: qualityProvider?.getCurrentQuality() || undefined,
      textTrack: textTrackProvider?.getActiveTrack() || undefined,
      audioTrack: audioTrackProvider?.getActiveTrack() || undefined,
      buffering: this.media.readyState < 3,
    };
  }

  // Enhanced container access
  getContainer(): HTMLElement {
    return this.container;
  }

  // Plugin API access
  getAPI(): PluginAPI {
    return this.pluginAPI;
  }

  requestFullscreen() {
    const container = this.getPlayerContainer() as HTMLElement & { webkitRequestFullscreen: () => void; mozRequestFullScreen: () => void; msRequestFullscreen: () => void; };
    const el = container;
    if (el.requestFullscreen) {
      el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (el.mozRequestFullScreen) {
      el.mozRequestFullScreen();
    } else if (el.msRequestFullscreen) {
      el.msRequestFullscreen();
    }
    this.events.emit(PlayerEvent.FULLSCREEN_CHANGE, true);
  }

  exitFullscreen() {
    const doc = document as Document & { webkitExitFullscreen: () => void; mozCancelFullScreen: () => void; msExitFullscreen: () => void; };
    if (doc.exitFullscreen) {
      doc.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
      doc.webkitExitFullscreen();
    } else if (doc.mozCancelFullScreen) {
      doc.mozCancelFullScreen();
    } else if (doc.msExitFullscreen) {
      doc.msExitFullscreen();
    }
    this.events.emit(PlayerEvent.FULLSCREEN_CHANGE, false);
  }

  destroy() {
    for (const p of this.plugins) p.dispose?.();
    this.plugins = [];
    this.pluginInstances.clear();

    if (this.frameExtractor) {
      this.frameExtractor.dispose();
      this.frameExtractor = null;
    }

    this.events.removeAll();
  }
}
