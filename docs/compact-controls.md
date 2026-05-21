# Compact Controls

The Compact Controls plugin provides a minimal overlay interface for small screens with a centered play/pause button and customizable action buttons, similar to YouTube's mobile player.

## Features

- **Centered play/pause**: Large button that syncs with player state
- **Auto-show on pause**: Controls appear when video is paused
- **Auto-hide on play**: Controls fade after 2 seconds
- **Custom action buttons**: Add prev/next or any custom actions
- **Absolute positioning**: Overlays video without affecting layout

## Layout

```
[⏮ Prev]  [▶ Play]  [⏭ Next]
```

## Usage

```typescript
import { Player, createControls, createCompactControls } from 'ssassplayer';

const player = new Player({
  media: document.getElementById('video'),
});

// Install regular controls
await player.usePlugin(createControls());

// Install compact controls for small screens
await player.usePlugin(createCompactControls({
  breakpoint: 480, // Show compact mode below 480px
  buttons: [
    {
      id: 'prev',
      tooltip: 'Back 10s',
      onClick: () => player.seek(player.getState().currentTime - 10)
    },
    {
      id: 'next', 
      tooltip: 'Forward 10s',
      onClick: () => player.seek(player.getState().currentTime + 10)
    }
  ]
}));
```

## Behavior

- **When paused**: Play button shows, controls are visible
- **When playing**: Pause button shows, controls auto-hide after 2s
- **On hover**: Controls become visible
- **Prev/Next buttons**: Positioned on sides of play button

## Options

```typescript
interface CompactControlsOptions {
  breakpoint?: number; // Width threshold (default: 480)
  buttons?: CompactButton[]; // Custom action buttons
}

interface CompactButton {
  id: string; // Unique identifier
  icon?: string | HTMLElement; // Custom icon (SVG string or element)
  tooltip?: string; // Hover tooltip
  onClick: (player: Player) => void; // Action callback
  visible?: boolean; // Show/hide button
}
```

## Built-in Icons

Use icons from the `ICONS` export:

```typescript
import { ICONS } from 'ssassplayer';

{
  id: 'custom',
  icon: ICONS.play, // or ICONS.pause, ICONS.volumeHigh, etc.
  onClick: () => { /* action */ }
}
```

## Dynamic Button Management

Add or remove buttons after initialization:

```typescript
const compactControls = await player.usePlugin(createCompactControls());

// Add a new button
compactControls.addButton({
  id: 'bookmark',
  icon: '<svg>...</svg>',
  tooltip: 'Bookmark this moment',
  onClick: () => console.log('Bookmarked at:', player.getState().currentTime)
});

// Remove a button
compactControls.removeButton('pip');
```

## Example: Custom Share Button

```typescript
await player.usePlugin(createCompactControls({
  buttons: [
    {
      id: 'share',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>',
      tooltip: 'Share video',
      onClick: () => {
        const url = player.currentSource;
        navigator.clipboard.writeText(url);
      }
    }
  ]
}));
```

## CSS Customization

```css
/* Style compact controls */
.compact-controls.active .cc-btn {
  background: rgba(99, 102, 241, 0.3);
}

/* Custom button colors */
.cc-btn-pip {
  background: rgba(255, 255, 255, 0.2);
}
```
