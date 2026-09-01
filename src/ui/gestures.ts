import { Player } from '../player';
import type { IPlayer, PluginAPI, PlayerPluginInstance, PluginManifest } from "../types";
import { ICONS, createSVG } from "./icons";

export interface GestureOptions {
  /** Seconds skipped by a double-tap / the J and L keys. Default 10. */
  skipSeconds?: number;
  /** Playback rate applied while pressing and holding. Default 2. */
  speedBoost?: number;
  /** Bind the document-level keyboard shortcuts. Default true. */
  enableKeyboardShortcuts?: boolean;
  /**
   * Show the floating fullscreen button in the top-right corner. Default true.
   * The Controls plugin already renders a fullscreen button, so set this to
   * false when using both to avoid offering the same action twice.
   */
  showFullscreenButton?: boolean;
}

export function createGestures(options: GestureOptions = {}): PluginManifest {
    return {
        name: "gestures",
        version: "1.0.0",
        factory: (player: IPlayer, api: PluginAPI) => new Gestures(player as Player, api, options),
    };
}

export class Gestures implements PlayerPluginInstance {
  root!: HTMLElement;
  player: Player;
  opts: Required<GestureOptions>;
  private center!: HTMLElement;
  private left!: HTMLElement;
  private right!: HTMLElement;
  private fsBtn!: HTMLButtonElement;
  private lastTap = 0;
  private lastTapX = 0;
  private isPointerDown = false;
  private tapTimer: ReturnType<typeof setTimeout> | null = null;
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private pressedBoost = false;
  private centerTimer: ReturnType<typeof setTimeout> | null = null;
  private skipTimers = new Map<'left' | 'right', ReturnType<typeof setTimeout>>();
  /** Aborts every DOM listener this plugin registers. */
  private listeners = new AbortController();
  private unsubscribes: Array<() => void> = [];

  constructor(player: Player, _api: PluginAPI, opts: GestureOptions = {}) {
    this.player = player;
    this.opts = {
      skipSeconds: opts.skipSeconds ?? 10,
      speedBoost: opts.speedBoost ?? 2,
      enableKeyboardShortcuts: opts.enableKeyboardShortcuts ?? true,
      showFullscreenButton: opts.showFullscreenButton ?? true,
    };
  }

  async install() {
    this.root = this.player.getContainer();
    const root = this.root;
    this.center = document.createElement('div');
    this.left = document.createElement('div');
    this.right = document.createElement('div');
    this.fsBtn = document.createElement('button');

    this.center.className = 'ap-g-center';
    this.left.className = 'ap-g-left';
    this.right.className = 'ap-g-right';
    this.fsBtn.className = 'ap-g-fs';

    this.fsBtn.appendChild(createSVG(ICONS.fullscreen));
    this.fsBtn.type = 'button';
    this.fsBtn.setAttribute('aria-label', 'Fullscreen');
    this.fsBtn.onclick = () => {
      if (this.player.getState().fullscreen) this.player.exitFullscreen();
      else this.player.requestFullscreen();
    };

    root.appendChild(this.center);
    root.appendChild(this.left);
    root.appendChild(this.right);
    if (this.opts.showFullscreenButton) root.appendChild(this.fsBtn);

    this.bind();
    if (this.opts.enableKeyboardShortcuts) this.bindKeyboard();
  }

  dispose() {
    // The pointer and document-level keyboard listeners would otherwise keep
    // driving a disposed player.
    this.listeners.abort();
    for (const off of this.unsubscribes) off();
    this.unsubscribes = [];

    for (const timer of [this.pressTimer, this.tapTimer, this.centerTimer]) {
      if (timer) clearTimeout(timer);
    }
    this.pressTimer = this.tapTimer = this.centerTimer = null;
    for (const timer of this.skipTimers.values()) clearTimeout(timer);
    this.skipTimers.clear();

    // A long-press that was still active must not leave the rate boosted.
    if (this.pressedBoost) {
      this.pressedBoost = false;
      this.player.setRate(1);
    }

    for (const el of [this.center, this.left, this.right, this.fsBtn]) el?.remove();
  }

  private bind() {
    const area = this.player.media || this.player.getContainer();

    const { signal } = this.listeners;

    // Listen to player volume changes to update feedback
    this.unsubscribes.push(this.player.on('volumechange', (vol, muted) => {
      if (muted || vol === 0) {
        this.showCenter(ICONS.volumeMute);
      } else if (vol < 0.5) {
        this.showCenter(ICONS.volumeLow);
      } else {
        this.showCenter(ICONS.volumeHigh);
      }
    }));

    area.addEventListener('pointerdown', () => {
      this.isPointerDown = true;
      if (this.pressTimer) clearTimeout(this.pressTimer);
      this.pressTimer = setTimeout(() => {
        this.pressedBoost = true;
        const rate0 = this.player.getState().playbackRate;
        this.player.setRate(this.opts.speedBoost);
        this.showCenter(rate0 < 1.5 ? ICONS.boost : ICONS.pause);
      }, 400);
    }, { signal });

    // Volume drag removed

    area.addEventListener('pointerup', e => {
      if (!this.isPointerDown) return;
      this.isPointerDown = false;
      if (this.pressTimer) clearTimeout(this.pressTimer);
      if (this.pressedBoost) {
        this.pressedBoost = false;
        this.player.setRate(1);
        return;
      }
      const now = Date.now();
      const rect = (area as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const dt = now - this.lastTap;
      const dbl = dt < 300 && Math.abs(x - this.lastTapX) < 80;

      if (dbl) {
        if (x < rect.width * 0.4) this.skip('left');
        else if (x > rect.width * 0.6) this.skip('right');
        this.lastTap = 0; this.lastTapX = 0;
        if (this.tapTimer) clearTimeout(this.tapTimer);
        this.tapTimer = null;
        return;
      }
      this.lastTap = now; this.lastTapX = x;
      if (this.tapTimer) clearTimeout(this.tapTimer);
      this.tapTimer = setTimeout(() => {
        this.tapTimer = null;
        // Single tap behavior (toggle play)
        this.togglePlay();
      }, 250);
    }, { signal });

    // A pointer that leaves the media (or is cancelled by a scroll) must not
    // leave `isPointerDown` stuck on, which would swallow the next tap.
    area.addEventListener('pointercancel', () => {
      this.isPointerDown = false;
      if (this.pressTimer) clearTimeout(this.pressTimer);
      if (this.pressedBoost) {
        this.pressedBoost = false;
        this.player.setRate(1);
      }
    }, { signal });
  }

  private togglePlay() {
    if (this.player.getState().paused) {
      void this.player.play().catch(() => {});
    } else {
      this.player.pause();
    }
  }

  private bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      const tag = target.tagName ? target.tagName.toLowerCase() : '';

      if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return;

      const s = this.player.getState();

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'j':
          // `skip()` already performs the seek; seeking here as well used to
          // jump twice the configured distance.
          e.preventDefault();
          this.skip('left');
          break;
        case 'l':
          e.preventDefault();
          this.skip('right');
          break;
        case 'arrowleft':
          e.preventDefault();
          this.player.seek(s.currentTime - 5);
          break;
        case 'arrowright':
          e.preventDefault();
          this.player.seek(s.currentTime + 5);
          break;
        case 'arrowup':
          e.preventDefault();
          this.player.setVolume(Math.min(1, s.volume + 0.05));
          break;
        case 'arrowdown':
          e.preventDefault();
          this.player.setVolume(Math.max(0, s.volume - 0.05));
          break;
        case 'm':
          e.preventDefault();
          this.player.setMuted(!s.muted);
          break;
        case 'f':
          e.preventDefault();
          if (s.fullscreen) this.player.exitFullscreen(); else this.player.requestFullscreen();
          break;
      }

      if (e.key >= '0' && e.key <= '9' && s.duration > 0) {
        e.preventDefault();
        const pct = parseInt(e.key, 10) * 10;
        this.player.seek((pct / 100) * s.duration);
      }
    }, { signal: this.listeners.signal });
  }

  private skip(side: 'left' | 'right') {
    const s = this.player.getState();
    const to = side === 'left' ? Math.max(0, s.currentTime - this.opts.skipSeconds) : Math.min(s.duration, s.currentTime + this.opts.skipSeconds);
    this.player.seek(to);
    const el = side === 'left' ? this.left : this.right;
    el.innerHTML = '';
    el.appendChild(createSVG(side === 'left' ? ICONS.back : ICONS.forward, { size: 48, color: "var(--ap-on-surface)" }));
    el.style.display = 'flex';
    const previous = this.skipTimers.get(side);
    if (previous) clearTimeout(previous);
    this.skipTimers.set(side, setTimeout(() => {
      this.skipTimers.delete(side);
      el.style.display = 'none';
    }, 500));
  }

  private showCenter(iconPath: string) {
    this.center.innerHTML = '';
    this.center.appendChild(createSVG(iconPath, { size: 48, color: "var(--ap-on-surface)" }));
    this.center.style.display = 'flex';

    // Restart the animation: clearing it and forcing a reflow makes the browser
    // treat the next assignment as a new animation.
    this.center.style.animation = 'none';
    void this.center.offsetHeight;
    this.center.style.animation = 'ap-fade-in 0.2s var(--ap-ease)';

    if (this.centerTimer) clearTimeout(this.centerTimer);
    this.centerTimer = setTimeout(() => { this.center.style.display = 'none'; }, 600);
  }
}