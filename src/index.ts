export { Emitter, type EmitterOptions } from "./emitter";
export { Player, type PlayerPlugin } from "./player";
export * from "./types";
export * from "./core";
export * from "./utils/dom";
export { isHlsUrl } from "./utils/media";

// UI
export {
  Menu,
  Dropdown,
  type MenuOptions,
  type MenuGroup,
  type MenuEntry,
  type MenuIcon,
} from "./ui/menu";
export {
  Controls,
  createControls,
  type ControlsOptions,
  type ControlIcons,
} from "./ui/controls";
export { Gestures, createGestures, type GestureOptions } from "./ui/gestures";
export { APMenuElement, APGesturesElement } from "./ui/components";
export { ICONS, createSVG, type CreateSVGOptions } from "./ui/icons";

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
export { createHlsPlugin, type HlsPluginOptions } from "./plugins/hls";

// ASS / SSA subtitle plugins
export { createAssPlugin, type AssPluginOptions } from "./plugins/ass/index";
export {
  createAssJsPlugin,
  type AssJsPluginOptions,
  type ASSInstance,
  type ASSConstructor,
} from "./plugins/assjs/index";
