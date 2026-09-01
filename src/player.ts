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
import { isHlsUrl } from "./utils/media";
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
  /** Aborts every DOM listener registered by `bind()` when the player is destroyed. */
  private listeners = new AbortController();
  private destroyed = false;

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

    // `play()` rejects when autoplay is blocked by the browser; surface it as an
    // `error` event instead of an unhandled promise rejection.
    if (options.autoplay) {
      void this.play().catch((error: unknown) => {
        this.events.emit(PlayerEvent.ERROR, error as Error);
      });
    }
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
    const { signal } = this.listeners;
    const on = (type: MediaEvent, handler: () => void) =>
      this.media.addEventListener(type, handler, { signal });

    const markReady = () => {
      if (this.ready) return;
      this.ready = true;
      this.events.emit(PlayerEvent.READY, this.media);
    };

    on(MediaEvent.LOADED_METADATA, () => {
      markReady();
      this.events.emit(PlayerEvent.LOADED_METADATA);
    });
    on(MediaEvent.LOADED_DATA, () => {
      if (this.media.duration) markReady();
    });
    on(MediaEvent.CAN_PLAY, () => {
      if (this.media.duration) markReady();
      this.events.emit(PlayerEvent.CAN_PLAY);
    });
    on(MediaEvent.PLAY, () => this.events.emit(PlayerEvent.PLAY));
    on(MediaEvent.PAUSE, () => this.events.emit(PlayerEvent.PAUSE));
    on(MediaEvent.TIME_UPDATE, () =>
      this.events.emit(
        PlayerEvent.TIME_UPDATE,
        this.media.currentTime,
        this.media.duration || 0,
      ),
    );
    on(MediaEvent.VOLUME_CHANGE, () =>
      this.events.emit(PlayerEvent.VOLUME_CHANGE, this.media.volume, this.media.muted),
    );
    on(MediaEvent.SEEKING, () =>
      this.events.emit(PlayerEvent.SEEKING, this.media.currentTime),
    );
    on(MediaEvent.SEEKED, () =>
      this.events.emit(PlayerEvent.SEEKED, this.media.currentTime),
    );
    on(MediaEvent.RATE_CHANGE, () =>
      this.events.emit(PlayerEvent.RATE_CHANGE, this.media.playbackRate),
    );
    on(MediaEvent.ERROR, () => {
      const error = this.media.error
        ? new Error(this.media.error.message || `Media error ${this.media.error.code}`)
        : new Error("media error");
      this.events.emit(PlayerEvent.ERROR, error);
    });
    on(MediaEvent.DURATION_CHANGE, () => {
      if (this.media.duration && this.media.duration > 0) {
        this.events.emit(PlayerEvent.DURATION_CHANGE, this.media.duration);
      }
    });
    on(MediaEvent.PROGRESS, () => {
      if (this.media.buffered.length > 0) {
        const bufferedEnd = this.media.buffered.end(
          this.media.buffered.length - 1,
        );
        this.events.emit(PlayerEvent.PROGRESS, bufferedEnd, this.media.duration || 0);
      }
    });
    on(MediaEvent.WAITING, () => this.events.emit(PlayerEvent.WAITING));
    on(MediaEvent.STALLED, () => this.events.emit(PlayerEvent.STALLED));
    on(MediaEvent.CAN_PLAY_THROUGH, () => this.events.emit(PlayerEvent.CAN_PLAY_THROUGH));
    on(MediaEvent.PLAYING, () => this.events.emit(PlayerEvent.PLAYING));
    on(MediaEvent.ENDED, () => this.events.emit(PlayerEvent.ENDED));

    // Fullscreen state is driven by the document, not by our own calls: pressing
    // Esc or using the browser UI must update listeners too.
    const emitFullscreen = () =>
      this.events.emit(PlayerEvent.FULLSCREEN_CHANGE, this.isFullscreen());
    for (const type of [
      "fullscreenchange",
      "webkitfullscreenchange",
      "mozfullscreenchange",
      "MSFullscreenChange",
    ]) {
      document.addEventListener(type, emitFullscreen, { signal: this.listeners.signal });
    }

    // Same for Picture-in-Picture.
    this.media.addEventListener(
      "enterpictureinpicture",
      () => this.events.emit(PlayerEvent.PIP_CHANGE, true),
      { signal },
    );
    this.media.addEventListener(
      "leavepictureinpicture",
      () => this.events.emit(PlayerEvent.PIP_CHANGE, false),
      { signal },
    );
  }

  /** True when this player's container (or its media element) owns the fullscreen view. */
  isFullscreen(): boolean {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      mozFullScreenElement?: Element | null;
      msFullscreenElement?: Element | null;
    };
    const el =
      doc.fullscreenElement ??
      doc.webkitFullscreenElement ??
      doc.mozFullScreenElement ??
      doc.msFullscreenElement ??
      null;
    return !!el && (el === this.container || el.contains(this.media));
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
      // When using hls.js, the src is set via MediaSource (blob: URL) which may
      // not be attached yet. Don't bail if hls-plugin is handling the source.
      if (!this.media.src && !this.media.srcObject && !this.hasPlugin("hls-plugin")) {
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
    const isHls = isHlsUrl(url);
    const supportsNativeHls = !!this.media.canPlayType("application/vnd.apple.mpegurl");

    if (isHls && !supportsNativeHls && this.hasPlugin("hls-plugin")) {
      // hls-plugin attaches a MediaSource itself; setting `src` here would make
      // Firefox reject the manifest as "not suitable".
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
      fullscreen: this.isFullscreen(),
      pip: document.pictureInPictureElement === this.media,
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
    // Always the container the player was constructed with, so overlays
    // (controls, menu, subtitles) go fullscreen together with the video.
    const el = this.container as HTMLElement & {
      webkitRequestFullscreen?: () => void;
      mozRequestFullScreen?: () => void;
      msRequestFullscreen?: () => void;
    };
    // `fullscreenchange` emits the event; nothing is assumed here.
    if (el.requestFullscreen) {
      void Promise.resolve(el.requestFullscreen()).catch(() => {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (el.mozRequestFullScreen) {
      el.mozRequestFullScreen();
    } else if (el.msRequestFullscreen) {
      el.msRequestFullscreen();
    }
  }

  exitFullscreen() {
    const doc = document as Document & {
      webkitExitFullscreen?: () => void;
      mozCancelFullScreen?: () => void;
      msExitFullscreen?: () => void;
    };
    if (doc.exitFullscreen) {
      void Promise.resolve(doc.exitFullscreen()).catch(() => {});
    } else if (doc.webkitExitFullscreen) {
      doc.webkitExitFullscreen();
    } else if (doc.mozCancelFullScreen) {
      doc.mozCancelFullScreen();
    } else if (doc.msExitFullscreen) {
      doc.msExitFullscreen();
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    // Detach every media/document listener registered by `bind()`.
    this.listeners.abort();

    for (const p of this.plugins) p.dispose?.();
    this.plugins = [];
    this.pluginInstances.clear();

    if (this.frameExtractor) {
      this.frameExtractor.dispose();
      this.frameExtractor = null;
    }

    this.events.destroy();
    this.container.classList.remove("ap-player");
  }
}
