export type EventMap = Record<string, any[]>;

/**
 * Declared as a type alias (not an interface) on purpose: a type alias gets an
 * implicit index signature, so it still satisfies `Emitter<T extends EventMap>`
 * while `keyof PlayerEvents` stays exact and typos are caught at compile time.
 */
export type PlayerEvents = {
  ready: [HTMLMediaElement];
  play: [];
  pause: [];
  timeupdate: [number, number];
  volumechange: [number, boolean];
  seeking: [number];
  seeked: [number];
  ratechange: [number];
  error: [Error];
  sourcechange: [string];
  qualitychange: [QualityLevel];
  fullscreenchange: [boolean];
  durationchange: [number];
  progress: [number, number];
  texttrackchange: [TextTrack | null];
  audioplayerchange: [AudioTrack];
  pipchange: [boolean];
  thumbnailsloaded: [ThumbnailData[]];
  waiting: [];
  stalled: [];
  canplaythrough: [];
  playing: [];
  menuitemadded: [MenuItem];
  menuitemremoved: [string];
  canplay: [];
  loadedmetadata: [];
  ended: [];
};

export enum PlayerEvent {
  READY = "ready",
  PLAY = "play",
  PAUSE = "pause",
  TIME_UPDATE = "timeupdate",
  VOLUME_CHANGE = "volumechange",
  SEEKING = "seeking",
  SEEKED = "seeked",
  RATE_CHANGE = "ratechange",
  ERROR = "error",
  SOURCE_CHANGE = "sourcechange",
  QUALITY_CHANGE = "qualitychange",
  FULLSCREEN_CHANGE = "fullscreenchange",
  DURATION_CHANGE = "durationchange",
  PROGRESS = "progress",
  TEXT_TRACK_CHANGE = "texttrackchange",
  AUDIO_PLAYER_CHANGE = "audioplayerchange",
  PIP_CHANGE = "pipchange",
  THUMBNAILS_LOADED = "thumbnailsloaded",
  WAITING = "waiting",
  STALLED = "stalled",
  CAN_PLAY_THROUGH = "canplaythrough",
  CAN_PLAY = "canplay",
  LOADED_METADATA = "loadedmetadata",
  ENDED = "ended",
  PLAYING = "playing",
  MENU_ITEM_ADDED = "menuitemadded",
  MENU_ITEM_REMOVED = "menuitemremoved",
}

export enum MediaEvent {
  LOADED_METADATA = "loadedmetadata",
  LOADED_DATA = "loadeddata",
  CAN_PLAY = "canplay",
  PLAY = "play",
  PAUSE = "pause",
  TIME_UPDATE = "timeupdate",
  VOLUME_CHANGE = "volumechange",
  SEEKING = "seeking",
  SEEKED = "seeked",
  RATE_CHANGE = "ratechange",
  ERROR = "error",
  DURATION_CHANGE = "durationchange",
  PROGRESS = "progress",
  WAITING = "waiting",
  STALLED = "stalled",
  CAN_PLAY_THROUGH = "canplaythrough",
  ENDED = "ended",
  PLAYING = "playing",
}

export const PlayerEventsList = [
  "ready",
  "play",
  "pause",
  "timeupdate",
  "volumechange",
  "seeking",
  "seeked",
  "ratechange",
  "error",
  "sourcechange",
  "qualitychange",
  "fullscreenchange",
  "durationchange",
  "progress",
  "texttrackchange",
  "audioplayerchange",
  "pipchange",
  "thumbnailsloaded",
  "waiting",
  "stalled",
  "canplaythrough",
  "playing",
  "menuitemadded",
  "menuitemremoved",
  "canplay",
  "loadedmetadata",
  "ended",
] as const;

// Plugin System Types
export interface QualityLevel {
  id: string | number;
  label: string;
  bitrate?: number;
  width?: number;
  height?: number;
  framerate?: number;
  codec?: string;
}

export interface TextTrack {
  id: string;
  label: string;
  language: string;
  kind: "subtitles" | "captions" | "descriptions" | "chapters" | "metadata";
  src?: string;
  active: boolean;
  content?: string;
}

export interface AudioTrack {
  id: string;
  label: string;
  language: string;
  enabled: boolean;
}

export interface ThumbnailData {
  time: number;
  x: number;
  y: number;
  width: number;
  height: number;
  url?: string;
}

export interface ThumbnailSprite {
  url: string;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  interval: number;
}

// Plugin Interfaces
export interface QualityPlugin {
  getAvailableQualities(): QualityLevel[];
  getCurrentQuality(): QualityLevel | null;
  setQuality(levelId: string | number): void;
  onQualityChange(callback: (level: QualityLevel) => void): void;
}

export interface TextTrackPlugin {
  getTextTracks(): TextTrack[];
  addTrack(track: Omit<TextTrack, "id"> & { id?: string }): string;
  removeTrack(trackId: string): void;
  setActiveTrack(trackId: string | null): void;
  getActiveTrack(): TextTrack | null;
  onTextTrackChange(callback: (track: TextTrack | null) => void): void;
}

export interface AudioTrackPlugin {
  getAudioTracks(): AudioTrack[];
  setActiveTrack(trackId: string): void;
  getActiveTrack(): AudioTrack | null;
  onAudioTrackChange(callback: (track: AudioTrack) => void): void;
}

export interface ThumbnailPlugin {
  loadThumbnails(sprite: ThumbnailSprite | ThumbnailSprite[]): Promise<void>;
  getThumbnailAtTime(time: number): ThumbnailData | null;
  getPreviewsURL(): string | null;
}

export interface PluginAPI {
  registerQualityProvider(plugin: QualityPlugin): void;
  registerTextTrackProvider(plugin: TextTrackPlugin): void;
  registerAudioTrackProvider(plugin: AudioTrackPlugin): void;
  registerThumbnailProvider(plugin: ThumbnailPlugin): void;
  getQualityProvider(): QualityPlugin | null;
  getTextTrackProvider(): TextTrackPlugin | null;
  getAudioTrackProvider(): AudioTrackPlugin | null;
  getThumbnailProvider(): ThumbnailPlugin | null;
  addMenuItem(item: MenuItem): void;
  removeMenuItem(itemId: string): void;
  getFrameExtractor():
    | import("./core/video/frame-extractor").VideoFrameExtractor
    | null;
}

export interface PlayerOptions {
  media: HTMLMediaElement;
  autoplay?: boolean;
  volume?: number;
  muted?: boolean;
  playbackRate?: number;
  container?: HTMLElement;
  crossOrigin?: string;
}

export interface MenuItem {
  id: string;
  label: string;
  type: "toggle" | "select" | "action" | "divider";
  value?: any;
  options?: Array<{ value: any; label: string }>;
  icon?: string | HTMLElement;
  disabled?: boolean;
  visible?: boolean;
  onChange?: (value: any) => void;
  onClick?: () => void;
}

export interface PlayerState {
  duration: number;
  currentTime: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  paused: boolean;
  ready: boolean;
  fullscreen: boolean;
  pip: boolean;
  quality?: QualityLevel;
  textTrack?: TextTrack;
  audioTrack?: AudioTrack;
  buffering?: boolean;
  error?: Error;
}

/**
 * Structural view of `Player` used by plugins, declared here to avoid a
 * circular import between `player.ts` and the plugin modules. The event
 * signatures mirror `Player` exactly so unknown event names are rejected.
 */
export interface IPlayer {
  media: HTMLMediaElement;
  events: { emit<K extends keyof PlayerEvents>(type: K, ...args: PlayerEvents[K]): void };
  currentSource?: string;
  src?: string;
  on<K extends keyof PlayerEvents>(
    type: K,
    handler: (...args: PlayerEvents[K]) => void,
  ): () => void;
  once<K extends keyof PlayerEvents>(
    type: K,
    handler: (...args: PlayerEvents[K]) => void,
  ): () => void;
  off<K extends keyof PlayerEvents>(
    type: K,
    handler: (...args: PlayerEvents[K]) => void,
  ): void;
  getContainer?(): HTMLElement;
  getAPI?(): PluginAPI;
}

// Plugin Manifest System

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  dependencies?: string[];
  factory: (player: IPlayer, api: PluginAPI) => PlayerPluginInstance;
}

export interface PlayerPluginInstance {
  install(): void | Promise<void>;
  dispose(): void | Promise<void>;
  [key: string]: any; // Allow additional properties
}
