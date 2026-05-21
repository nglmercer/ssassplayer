# ssassplayer Documentation

Welcome to the **ssassplayer** documentation. This library provides a highly customizable, video player experience for the web.

## Quick Links

- [**Getting Started**](./docs/getting-started.md) - Installation and basic setup.
- [**HLS & DASH Streaming**](./docs/hls-streaming.md) - How to play HLS (.m3u8) and DASH (.mpd) streams.
- [**Thumbnail Previews**](./docs/thumbnail-previews.md) - YouTube-style hover preview thumbnails.
- [**UI Customization**](./docs/ui-customization.md) - Using Controls, Menus, and modifying styles.
- [**Gestures & Shortcuts**](./docs/gestures-and-shortcuts.md) - Touch gestures and keyboard controls.
- [**Examples**](./examples/README.md) - Implementations for Vanilla JS, Preact, and Vue.

## Features

- **Modern UI**: YouTube-inspired design with glassmorphism and smooth animations.
- **HLS & DASH Support**: Shaka Player plugin for adaptive streaming (recommended) or hls.js for HLS-only.
- **Hover Thumbnail Previews**: YouTube-style sprite sheet previews on progress bar hover.
- **ASS/SSA Subtitles**: Built-in support for animated subtitle formats.
- **Accessibility**: Keyboard navigation and ARIA support.
- **Extensible**: Plugin system for quality, audio tracks, thumbnails, and more.

## Plugins Overview

| Plugin | Description | Install |
|--------|-------------|---------|
| `createShakaPlugin` | HLS + DASH playback (recommended) | `npm install shaka-player` |
| `createHlsPlugin` | HLS playback using hls.js | `npm install hls.js` |
| `createVttThumbnailPlugin` | Hover preview thumbnails | Built-in |
| `createAssPlugin` | ASS/SSA subtitle rendering | Built-in |
| `createAssJsPlugin` | ASS/SSA via assjs | `npm install assjs` |
| `createControls` | Default UI controls | Built-in |
| `createGestures` | Touch/mouse gestures | Built-in |

## Quick Start

```typescript
import { Player, createShakaPlugin, createControls, createGestures, createVttThumbnailPlugin } from 'ssassplayer';

const player = new Player({
  media: document.getElementById('video'),
});

// Streaming (HLS + DASH)
await player.usePlugin(createShakaPlugin({
  shakaConfig: {
    streaming: { bufferingGoal: 60 },
    abr: { enabled: true },
  }
}));

// Thumbnail previews on hover
await player.usePlugin(createVttThumbnailPlugin({
  vttUrl: '/path/to/thumbnails.vtt'
}));

// UI
await player.usePlugin(createControls());
await player.usePlugin(createGestures());

// Load source
player.setSource('https://example.com/stream.m3u8');
```

## Demos
<img width="1013" height="751" alt="imagen" src="https://github.com/user-attachments/assets/506b7cb4-a784-4adb-8422-c55438064bae" />
<img width="965" height="735" alt="imagen" src="https://github.com/user-attachments/assets/fead4fec-ead7-4f8b-b96a-875039e067f0" />
