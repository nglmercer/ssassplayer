# Hover Thumbnail Previews

ssassplayer supports YouTube-style hover thumbnail previews on the progress bar using VTT sprite sheets.

## How It Works (YouTube's Strategy)

YouTube uses a highly efficient approach:

1. **Server-side**: Generates a sprite sheet containing hundreds of thumbnails in a grid layout
2. **VTT file**: A small WebVTT file maps time ranges to positions in the sprite sheet
3. **Client-side**: On hover, calculates time → looks up VTT entry → sets `background-position` to show the correct tile

**Benefits:**
- Only **1 HTTP request** for the entire sprite sheet
- VTT file is tiny (~50KB for a 2-hour video)
- Instant display - no decoding delay
- Works offline once cached

## Setup

```bash
npm install ssassplayer
```

## Usage

### Option 1: VTT File (Recommended)

```typescript
import { Player, createVttThumbnailPlugin } from 'ssassplayer';

const player = new Player({ media: videoElement });

await player.usePlugin(createVttThumbnailPlugin({
  vttUrl: '/path/to/thumbnails.vtt'
}));
```

### Option 2: Direct Sprite Configuration

```typescript
await player.usePlugin(createVttThumbnailPlugin({
  sprites: [{
    url: '/thumbs/sprite.jpg',
    width: 1600,      // Total sprite sheet width
    height: 900,      // Total sprite sheet height
    tileWidth: 160,   // Individual thumbnail width
    tileHeight: 90,   // Individual thumbnail height
    interval: 10      // Seconds between each thumbnail
  }]
}));
```

## VTT File Format

The VTT file maps time ranges to sprite positions using the `#xywh` fragment:

```vtt
WEBVTT

00:00:00.000 --> 00:00:10.000
sprite.jpg#xywh=0,0,160,90

00:00:10.000 --> 00:00:20.000
sprite.jpg#xywh=160,0,160,90

00:00:20.000 --> 00:00:30.000
sprite.jpg#xywh=320,0,160,90
```

The `#xywh` format is: `x,y,width,height` where:
- `x`, `y`: Top-left corner of the thumbnail in the sprite sheet
- `width`, `height`: Dimensions of the thumbnail

## Generating Sprite Sheets

### Using FFmpeg

```bash
# Extract frames every 10 seconds
ffmpeg -i video.mp4 -vf "fps=1/10,scale=160:-1" thumb%04d.jpg

# Create sprite sheet (10x10 grid)
ffmpeg -i thumb%04d.jpg -filter_complex \
  "tile=10x10:margin=0:padding=0" \
  sprite.jpg
```

### Using Node.js

```bash
npm install sharp
```

```typescript
import sharp from 'sharp';

async function createSprite(thumbnails: string[], output: string, cols: number) {
  const images = await Promise.all(thumbnails.map(f => sharp(f).resize(160, 90).toBuffer()));
  
  const rows = Math.ceil(thumbnails.length / cols);
  const composite = [];
  
  for (let i = 0; i < thumbnails.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    composite.push({
      input: images[i],
      left: col * 160,
      top: row * 90
    });
  }
  
  await sharp({
    create: {
      width: cols * 160,
      height: rows * 90,
      channels: 3,
      background: { r: 0, g: 0, b: 0 }
    }
  })
  .composite(composite)
  .toFile(output);
}
```

## Multiple Sprite Sheets

For long videos, you can use multiple sprite sheets:

```typescript
await player.usePlugin(createVttThumbnailPlugin({
  sprites: [
    { url: '/thumbs/sprite1.jpg', width: 1600, height: 900, tileWidth: 160, tileHeight: 90, interval: 10 },
    { url: '/thumbs/sprite2.jpg', width: 1600, height: 900, tileWidth: 160, tileHeight: 90, interval: 10 },
  ]
}));
```

## CORS Configuration

If your sprite sheets are on a different domain:

```typescript
await player.usePlugin(createVttThumbnailPlugin({
  vttUrl: 'https://cdn.example.com/thumbnails.vtt',
  cors: 'anonymous'
}));
```
