export { Emitter } from "./emitter";
export { Player } from "./player";
export * from "./types";
export * from "./core";
export * from "./utils/dom";
export { Menu, Dropdown, type MenuOptions,type MenuGroup } from "./ui/menu";
export { Controls, createControls } from "./ui/controls";
export { Gestures, createGestures } from "./ui/gestures";
export { CompactControls, createCompactControls } from "./plugins/compact-controls";
export type { CompactControlsOptions, CompactButton } from "./plugins/compact-controls";
export { APMenuElement, APGesturesElement } from "./ui/components";
// Plugin interfaces (re-export for convenience)
export type {
  QualityPlugin,
  TextTrackPlugin,
  AudioTrackPlugin,
  ThumbnailPlugin,
  PluginManifest,
  PlayerPluginInstance,
  QualityLevel,
  TextTrack,
  AudioTrack,
  ThumbnailData,
  ThumbnailSprite,
} from "./types";



// HLS Plugin
export { createHlsPlugin } from "./plugins/hls";
export type { HlsPluginOptions } from "./plugins/hls";

// Shaka Plugin (HLS + DASH)
export { createShakaPlugin } from "./plugins/shaka";
export type { ShakaPlayerOptions } from "./plugins/shaka";

// VTT Thumbnail Plugin (Hover Preview)
export { createVttThumbnailPlugin } from "./plugins/vtt-thumbnail";
export type { VttThumbnailOptions } from "./plugins/vtt-thumbnail";

export { createAssPlugin } from "./plugins/ass/index";
export { createAssJsPlugin, AssJsPluginOptions } from "./plugins/assjs/index";
