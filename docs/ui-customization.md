# UI Customization

The player ships a dark-first control bar built from CSS custom properties.
Everything below is scoped to `.ap-player`, the class the `Player` adds to its
container, so nothing leaks into the surrounding page.

```ts
import 'ssassplayer/style.css';
```

## Using Controls

`createControls()` renders a gradient scrim pinned to the bottom edge, a
full-bleed progress rail and a flush row of buttons.

```ts
import { Player, createControls } from 'ssassplayer';

const player = new Player({ media: video, container });

await player.usePlugin(createControls({
  // Idle milliseconds before the bar hides during playback. 0 keeps it
  // on screen permanently. Default 2800.
  autoHideDelay: 2800,
  // Time-at-pointer tooltip above the progress rail. Default true.
  showSeekTooltip: true,
  // Any subset of the built-in icons, as an SVG string or an element.
  icons: { play: '<path d="..."/>' },
}));
```

The bar is visible by default and hides itself after `autoHideDelay` of pointer
inactivity — but only while playing, and never while the pointer is over it,
focus is inside it, or the settings menu is open. The pointer is hidden along
with it.

Two escape hatches:

```ts
controls.setKeepVisible(true);          // pin it open, e.g. behind your own panel
element.classList.add('visible');       // or pin the bar itself from CSS
```

## Theming

Dark is the default. The light palette is applied when the OS asks for it, and
either theme can be forced per player:

```html
<div class="player" data-ap-theme="dark">…</div>   <!-- always dark -->
<div class="player" data-ap-theme="light">…</div>  <!-- always light -->
<div class="player">…</div>                        <!-- follows the OS -->
```

## Styling (CSS custom properties)

Override the tokens on your container. These are the supported surface; the
rest of the stylesheet is internal.

| Variable | Description | Default (dark) |
|---|---|---|
| `--ap-accent` | Progress fill, selection, focus rings | `#ff3b30` |
| `--ap-accent-hover` | Accent hover state | `#ff5f57` |
| `--ap-surface` | Menus, tooltips, floating affordances | `rgba(24,24,27,.94)` |
| `--ap-on-surface` | Primary text and icons | `#ffffff` |
| `--ap-on-surface-variant` | Secondary text | `rgba(255,255,255,.62)` |
| `--ap-outline` | Hairline borders | `rgba(255,255,255,.11)` |
| `--ap-scrim` | Gradient behind the control bar | `linear-gradient(…)` |
| `--ap-track` | Unplayed progress rail | `rgba(255,255,255,.26)` |
| `--ap-track-buffered` | Buffered range | `rgba(255,255,255,.46)` |
| `--ap-scrubber` | Scrubber handle and volume fill | `#ffffff` |
| `--ap-controls-height` | Button row height | `46px` |
| `--ap-btn-size` | Button hit target | `36px` (`44px` on touch) |
| `--ap-progress-height` | Rail height (idle / hover) | `4px` / `7px` |
| `--ap-radius-lg` \| `-md` \| `-sm` | Corner radii | `14px` \| `10px` \| `6px` |
| `--ap-player-shadow` | Drop shadow on the player itself | `none` |

```css
.player {
  --ap-accent: #3b82f6;
  --ap-controls-height: 56px;
  --ap-radius-lg: 20px;
}
```

Both palettes are also exposed raw as `--ap-dark-*` and `--ap-light-*` if you
want to retheme one without touching the other.

Touch devices (`pointer: coarse`) automatically get larger hit targets and drop
the hover-to-expand volume slider, leaving the mute button. `prefers-reduced-motion`
is honoured throughout.

## Adding custom buttons

```ts
const btn = controls.addButton('right', '<path d="…"/>', () => share(), {
  label: 'Share',          // becomes aria-label
  className: 'my-share',
});
```

`'left'` appends to the left group; `'right'` inserts before the settings
button so it stays rightmost. `controls.getSettingsButton()` returns the gear
button if you want to wire your own menu to it.

## Adding custom menu items

```ts
player.getAPI().addMenuItem({
  id: 'custom-action',
  label: 'My Action',
  type: 'action',
  icon: '<svg>…</svg>',
  onClick: () => console.log('Action clicked!'),
});
```
