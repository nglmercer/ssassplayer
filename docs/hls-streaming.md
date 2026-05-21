# HLS & DASH Streaming

ssassplayer provides powerful streaming plugins:
- **HLS Plugin** powered by `hls.js` (HLS only)
- **Shaka Plugin** powered by `shaka-player` (HLS + DASH, recommended)

## Shaka Player (Recommended)

Shaka Player supports both HLS (.m3u8) and DASH (.mpd), has better adaptive bitrate algorithms, and is maintained by Google.

### Setup

```bash
npm install shaka-player
```

### Usage

```typescript
import { Player, createShakaPlugin } from 'ssassplayer';

const player = new Player({
  media: document.getElementById('video'),
});

await player.usePlugin(createShakaPlugin({
  shakaConfig: {
    streaming: {
      bufferingGoal: 60,
    },
    abr: {
      enabled: true,
    },
  }
}));

player.setSource('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
// or DASH
player.setSource('https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd');
```

## HLS Plugin (Legacy)

If you only need HLS support and prefer hls.js:

```bash
npm install hls.js
```

```typescript
import { Player, createHlsPlugin } from 'ssassplayer';
import Hls from 'hls.js';

const player = new Player({
  media: document.getElementById('video'),
});

await player.usePlugin(createHlsPlugin({
  hlsConfig: {
    capLevelToPlayerSize: true,
  }
}));

player.setSource('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
```

## Quality Management

Both plugins automatically register a Quality Provider:

```typescript
const qualityPlugin = player.getAPI().getQualityProvider();

if (qualityPlugin) {
  const levels = qualityPlugin.getQualities();
  qualityPlugin.setQuality(levels[0].id);
}
```

The plugins emit `qualitychange` events on quality switches.
