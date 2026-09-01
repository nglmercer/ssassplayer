import { Player } from "../player";
import type { IPlayer, PluginAPI, PlayerEvents, PlayerPluginInstance, PluginManifest } from "../types";
import { ICONS, createSVG } from "./icons";

export interface ControlIcons {
    play?: string | HTMLElement;
    pause?: string | HTMLElement;
    volumeOn?: string | HTMLElement;
    volumeMute?: string | HTMLElement;
    settings?: string | HTMLElement;
    fullscreen?: string | HTMLElement;
    exitFullscreen?: string | HTMLElement;
    // Feedback icons
    playBig?: string | HTMLElement;
    pauseBig?: string | HTMLElement;
    loading?: string | HTMLElement;
}

export interface ControlsOptions {
    icons?: ControlIcons;
    /**
     * Milliseconds of pointer inactivity before the bar hides during playback.
     * Set to 0 to keep the controls on screen permanently. Default 2800.
     */
    autoHideDelay?: number;
    /** Show the time-at-pointer tooltip above the progress rail. Default true. */
    showSeekTooltip?: boolean;
}

const DEFAULT_ICONS = {
    play: ICONS.play,
    pause: ICONS.pause,
    volumeOn: ICONS.volumeHigh,
    volumeMute: ICONS.volumeMute,
    settings: ICONS.settings,
    fullscreen: ICONS.fullscreen,
    exitFullscreen: ICONS.exitFullscreen,
    playBig: ICONS.play,
    pauseBig: ICONS.pause,
    loading: ICONS.loading
};

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor(seconds / 3600);
    const p = (n: number) => n.toString().padStart(2, '0');
    if (h > 0) return `${h}:${p(m)}:${p(s)}`;
    return `${m}:${p(s)}`;
}


export function createControls(options: ControlsOptions = {}): PluginManifest {
    return {
        name: "controls",
        version: "1.0.0",
        factory: (player: IPlayer, api: PluginAPI) => new Controls(player as Player, api, options),
    };
}

export class Controls implements PlayerPluginInstance {
    element!: HTMLElement;
    private player: Player;
    private options: ControlsOptions;
    private icons: Required<ControlIcons> = DEFAULT_ICONS;

    private progressContainer!: HTMLElement;
    private progressBar!: HTMLElement;
    private progressPlayed!: HTMLElement;
    private progressLoaded!: HTMLElement;
    private progressHover!: HTMLElement;
    private progressTooltip!: HTMLElement;
    private scrubber!: HTMLElement;
    private playBtn!: HTMLElement;
    private muteBtn!: HTMLElement;
    private volRange!: HTMLInputElement;
    private timeDisplay!: HTMLElement;
    private fullscreenBtn!: HTMLElement;
    private settingsBtn!: HTMLElement;
    private loader!: HTMLElement;

    // Time format cycling
    private timeFormat: 'elapsed' | 'remaining' = 'elapsed';

    // Feedback
    private feedbackOverlay!: HTMLElement;
    private bigPlayBtn!: HTMLElement;
    private bigPlayBtnInner!: HTMLButtonElement;
    private feedbackTimeout: ReturnType<typeof setTimeout> | null = null;

    /** Aborts the document-level drag listeners on dispose. */
    private listeners = new AbortController();
    /** Unsubscribe callbacks for the player events this instance subscribes to. */
    private unsubscribes: Array<() => void> = [];
    private isDragging = false;

    /** Idle countdown that hides the bar during playback. */
    private hideTimer: ReturnType<typeof setTimeout> | null = null;
    /**
     * Set by `setKeepVisible()`. Overlays owned by the host (a custom panel,
     * a dropdown) can pin the bar open while they are on screen.
     */
    private keepVisible = false;

    constructor(player: Player, _api: PluginAPI, options: ControlsOptions = {}) {
        this.player = player;
        this.options = options;
    }

    async install() {
        this.icons = { ...DEFAULT_ICONS, ...(this.options.icons || {}) };
        this.element = this.createDOM();
        this.player.getContainer().appendChild(this.element);
        this.bindEvents();
    }

    dispose() {
        // Document-level drag listeners and player subscriptions outlive the DOM
        // nodes, so they have to be torn down explicitly.
        this.listeners.abort();
        for (const off of this.unsubscribes) off();
        this.unsubscribes = [];

        for (const timer of [this.feedbackTimeout, this.hideTimer]) {
            if (timer) clearTimeout(timer);
        }
        this.feedbackTimeout = null;
        this.hideTimer = null;

        // The class lives on the container, which outlives this plugin.
        this.player.getContainer().classList.remove('ap-controls-hidden');

        for (const el of [this.element, this.feedbackOverlay, this.bigPlayBtn, this.loader]) {
            el?.remove();
        }
    }

    private createDOM(): HTMLElement {
        const controls = document.createElement("div");
        controls.className = "controls";

        // Feedback Overlay (Visual Bezel)
        this.feedbackOverlay = document.createElement("div");
        this.feedbackOverlay.className = "feedback-overlay";
        this.feedbackOverlay.setAttribute("aria-hidden", "true");
        // We append it to the player container (parent of controls), not controls itself usually, to center over video
        // But the constructor takes container. Let's append to container if we can, or controls parent.
        // Actually, let's append to the passed container (which is player wrapper)
        this.player.getContainer().appendChild(this.feedbackOverlay);

        // Big Play Button (Initial/Paused State)
        // The stylesheet makes the wrapper click-through and puts the circular
        // hit area on the inner button, so the icon must live inside that button
        // rather than directly on the wrapper.
        this.bigPlayBtn = document.createElement("div");
        this.bigPlayBtn.className = "ap-big-play";
        this.bigPlayBtnInner = document.createElement("button");
        this.bigPlayBtnInner.type = "button";
        this.bigPlayBtnInner.className = "ap-big-play-btn";
        this.bigPlayBtnInner.setAttribute("aria-label", "Play");
        this.bigPlayBtnInner.appendChild(createSVG(this.icons.playBig, { size: 64, color: "var(--ap-on-surface)" }));
        this.bigPlayBtn.appendChild(this.bigPlayBtnInner);
        this.player.getContainer().appendChild(this.bigPlayBtn);

        // Loader Spinner
        this.loader = document.createElement("div");
        this.loader.className = "ap-loader";
        this.loader.setAttribute("aria-hidden", "true");
        this.loader.appendChild(createSVG(this.icons.loading, { size: 64, color: "var(--ap-primary)" }));
        this.player.getContainer().appendChild(this.loader);

        // Progress
        const progRow = document.createElement("div");
        progRow.className = "controls-progress";

        this.progressContainer = document.createElement("div");
        this.progressContainer.className = "progress-container";
        this.progressContainer.tabIndex = 0; // Focusable
        this.progressContainer.setAttribute("role", "slider");
        this.progressContainer.setAttribute("aria-label", "Seek");
        this.progressContainer.setAttribute("aria-valuemin", "0");
        this.progressContainer.setAttribute("aria-valuemax", "0");
        this.progressContainer.setAttribute("aria-valuenow", "0");

        this.progressBar = document.createElement("div");
        this.progressBar.className = "progress-bar";

        this.progressLoaded = document.createElement("div");
        this.progressLoaded.className = "progress-loaded";

        // Ghost fill previewing where a click would seek to.
        this.progressHover = document.createElement("div");
        this.progressHover.className = "progress-hover";

        this.progressPlayed = document.createElement("div");
        this.progressPlayed.className = "progress-played";

        this.scrubber = document.createElement("div");
        this.scrubber.className = "scrubber";

        this.progressBar.appendChild(this.progressLoaded);
        this.progressBar.appendChild(this.progressHover);
        this.progressBar.appendChild(this.progressPlayed);

        // The scrubber rides the right edge of the played fill.
        this.progressPlayed.appendChild(this.scrubber);
        this.progressContainer.appendChild(this.progressBar);

        this.progressTooltip = document.createElement("div");
        this.progressTooltip.className = "progress-tooltip";
        this.progressTooltip.setAttribute("aria-hidden", "true");
        if (this.options.showSeekTooltip !== false) {
            this.progressContainer.appendChild(this.progressTooltip);
        }
        progRow.appendChild(this.progressContainer);
        controls.appendChild(progRow);

        // Main controls
        const mainRow = document.createElement("div");
        mainRow.className = "controls-main";

        // Left
        const left = document.createElement("div");
        left.className = "controls-left";

        this.playBtn = document.createElement("button");
        this.playBtn.className = "ctrl btn play-pause";
        this.playBtn.setAttribute("type", "button");
        this.playBtn.setAttribute("aria-label", "Play");
        this.playBtn.appendChild(createSVG(this.icons.play));
        left.appendChild(this.playBtn);

        const volContainer = document.createElement("div");
        volContainer.className = "volume-container";
        this.muteBtn = document.createElement("button");
        this.muteBtn.className = "ctrl btn";
        this.muteBtn.setAttribute("type", "button");
        this.muteBtn.setAttribute("aria-label", "Mute");
        this.muteBtn.appendChild(createSVG(this.icons.volumeOn));

        this.volRange = document.createElement("input");
        this.volRange.type = "range";
        this.volRange.className = "ctrl";
        this.volRange.min = "0";
        this.volRange.max = "1";
        this.volRange.step = "0.05";
        this.volRange.value = "1";
        this.volRange.setAttribute("aria-label", "Volume");
        // Fix for volume thumb vertical alignment: relying on flexbox alignment in CSS
        // The issue is likely the default browser appearance or margin. 
        // We ensure it has no extra margin and is aligned.
        this.volRange.style.margin = "0";
        this.volRange.style.verticalAlign = "middle";

        volContainer.appendChild(this.muteBtn);
        volContainer.appendChild(this.volRange);
        left.appendChild(volContainer);

        this.timeDisplay = document.createElement("div");
        this.timeDisplay.className = "time-display";
        this.timeDisplay.textContent = "0:00 / 0:00";
        this.timeDisplay.title = "Click to change time format";
        left.appendChild(this.timeDisplay);

        mainRow.appendChild(left);

        // Center
        const center = document.createElement("div");
        center.className = "controls-center";
        mainRow.appendChild(center);

        // Right
        const right = document.createElement("div");
        right.className = "controls-right";

        this.settingsBtn = document.createElement("button");
        this.settingsBtn.className = "ctrl btn settings-button";
        this.settingsBtn.setAttribute("type", "button");
        this.settingsBtn.setAttribute("aria-label", "Settings");
        this.settingsBtn.appendChild(createSVG(this.icons.settings));
        right.appendChild(this.settingsBtn);

        this.fullscreenBtn = document.createElement("button");
        this.fullscreenBtn.className = "ctrl btn";
        this.fullscreenBtn.setAttribute("type", "button");
        this.fullscreenBtn.setAttribute("aria-label", "Fullscreen");
        this.fullscreenBtn.appendChild(createSVG(this.icons.fullscreen));
        right.appendChild(this.fullscreenBtn);

        mainRow.appendChild(right);
        controls.appendChild(mainRow);

        return controls;
    }

    private bindEvents() {
        const { signal } = this.listeners;
        /** Subscribes to a player event and remembers how to unsubscribe. */
        const onPlayer = <K extends keyof PlayerEvents>(
            type: K,
            handler: (...args: PlayerEvents[K]) => void,
        ) => {
            this.unsubscribes.push(this.player.on(type, handler));
        };

        this.bigPlayBtnInner.onclick = (e) => {
            e.stopPropagation();
            this.togglePlay();
        };

        this.playBtn.onclick = (e) => {
            e.stopPropagation(); // prevent bubbling to container click if any
            this.togglePlay();
        };

        // Note: Click on video to toggle play is handled by the Gestures plugin.

        this.muteBtn.onclick = () => {
            const s = this.player.getState();
            this.player.setMuted(!s.muted);
        };

        this.volRange.oninput = (e) => {
            const v = parseFloat((e.target as HTMLInputElement).value);
            this.player.setVolume(v);
            // Un-mute when the user drags the slider up from a muted state,
            // otherwise the slider moves but nothing is audible.
            if (v > 0 && this.player.getState().muted) this.player.setMuted(false);
        };

        this.fullscreenBtn.onclick = () => {
            const s = this.player.getState();
            if (s.fullscreen) this.player.exitFullscreen();
            else this.player.requestFullscreen();
        };

        // Time display click - cycle through formats
        this.timeDisplay.onclick = (e) => {
            e.stopPropagation();
            this.timeFormat = this.timeFormat === 'elapsed' ? 'remaining' : 'elapsed';
            this.updateTimeDisplay();
        };

        // --- Seeking (pointer events cover mouse, touch and pen in one path) ---
        const clientXOf = (e: PointerEvent | MouseEvent | TouchEvent) =>
            'touches' in e
                ? (e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0)
                : e.clientX;

        const timeAt = (clientX: number) => {
            const rect = this.progressContainer.getBoundingClientRect();
            if (rect.width === 0) return 0;
            const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const duration = this.player.getState().duration || 0;
            const time = pos * duration;

            // Immediate visual feedback; the media element catches up asynchronously.
            this.progressPlayed.style.width = `${pos * 100}%`;
            this.updateTimeDisplay(time, duration);

            return time;
        };

        const seek = (e: PointerEvent | MouseEvent | TouchEvent) => {
            this.player.seek(timeAt(clientXOf(e)));
        };

        /** Positions the ghost fill and the time tooltip under the pointer. */
        const previewAt = (clientX: number) => {
            const rect = this.progressContainer.getBoundingClientRect();
            if (rect.width === 0) return;
            const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const duration = this.player.getState().duration || 0;

            this.progressHover.style.width = `${pos * 100}%`;
            this.progressTooltip.textContent = formatTime(pos * duration);

            // Keep the tooltip inside the rail rather than letting it spill out
            // of the player at either end.
            const half = this.progressTooltip.offsetWidth / 2;
            const x = Math.max(half + 4, Math.min(rect.width - half - 4, pos * rect.width));
            this.progressTooltip.style.left = `${x}px`;
            this.progressTooltip.style.transform = 'translateX(-50%)';
        };

        this.progressContainer.addEventListener('pointerdown', (e) => {
            // Ignore right/middle clicks.
            if (e.button !== 0) return;
            this.isDragging = true;
            this.progressContainer.classList.add('is-scrubbing');
            this.progressContainer.setPointerCapture?.(e.pointerId);
            seek(e);
        }, { signal });

        this.progressContainer.addEventListener('pointermove', (e) => {
            previewAt(e.clientX);
            if (this.isDragging) seek(e);
        }, { signal });

        this.progressContainer.addEventListener('pointerleave', () => {
            this.progressHover.style.width = '0%';
        }, { signal });

        const endDrag = (e: PointerEvent) => {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.progressContainer.classList.remove('is-scrubbing');
            seek(e);
        };
        this.progressContainer.addEventListener('pointerup', endDrag, { signal });
        this.progressContainer.addEventListener('pointercancel', endDrag, { signal });
        // A pointer released outside the bar must still end the drag.
        document.addEventListener('pointerup', endDrag, { signal });

        // Keyboard seeking for the focusable progress bar.
        this.progressContainer.addEventListener('keydown', (e) => {
            const s = this.player.getState();
            const step = e.shiftKey ? 10 : 5;
            switch (e.key) {
                case 'ArrowLeft': this.player.seek(s.currentTime - step); break;
                case 'ArrowRight': this.player.seek(s.currentTime + step); break;
                case 'Home': this.player.seek(0); break;
                case 'End': this.player.seek(s.duration); break;
                default: return;
            }
            e.preventDefault();
        }, { signal });

        // --- Player Events ---
        onPlayer('play', () => {
            this.updatePlayBtn(false);
            this.showFeedback(this.icons.playBig);
            this.bigPlayBtn.style.display = 'none';
        });
        onPlayer('pause', () => {
            this.updatePlayBtn(true);
            this.showFeedback(this.icons.pauseBig);
            this.bigPlayBtn.style.display = '';
        });

        onPlayer('volumechange', (vol, muted) => {
            this.volRange.value = String(muted ? 0 : vol);
            this.volRange.style.setProperty('--volume-percent', `${(muted ? 0 : vol) * 100}%`);
            this.updateMuteBtn(muted, vol);
        });

        onPlayer('timeupdate', (time, duration) => {
            if (this.isDragging) return;
            const pct = duration > 0 ? (time / duration) * 100 : 0;
            this.progressPlayed.style.width = `${pct}%`;
            this.updateTimeDisplay(time, duration);
        });

        onPlayer('progress', (buffered, duration) => {
            const pct = duration > 0 ? (buffered / duration) * 100 : 0;
            this.progressLoaded.style.width = `${pct}%`;
        });

        onPlayer('fullscreenchange', (isFull) => {
            this.fullscreenBtn.innerHTML = '';
            this.fullscreenBtn.appendChild(createSVG(isFull ? this.icons.exitFullscreen : this.icons.fullscreen));
            this.fullscreenBtn.setAttribute('aria-label', isFull ? 'Exit fullscreen' : 'Fullscreen');
        });

        // Buffering indicator
        const showLoader = () => this.loader.classList.add('visible');
        const hideLoader = () => this.loader.classList.remove('visible');
        onPlayer('waiting', showLoader);
        onPlayer('stalled', showLoader);
        onPlayer('seeking', showLoader);
        onPlayer('canplay', hideLoader);
        onPlayer('canplaythrough', hideLoader);
        onPlayer('playing', hideLoader);
        onPlayer('seeked', hideLoader);
        onPlayer('error', hideLoader);

        // --- Auto-hide -------------------------------------------------
        // The bar is visible by default and hidden by this plugin after an idle
        // period during playback. Driving it from JS (rather than a CSS
        // `:hover` rule) is what lets it survive keyboard-only use and
        // arbitrary container class names.
        const container = this.player.getContainer();
        container.addEventListener('pointermove', () => this.showControls(), { signal });
        container.addEventListener('pointerdown', () => this.showControls(), { signal });
        container.addEventListener('focusin', () => this.showControls(), { signal });
        container.addEventListener('pointerleave', () => {
            // Leaving the player hides the bar straight away while playing,
            // instead of waiting out the remaining idle time.
            if (!this.player.getState().paused) this.hideControls();
        }, { signal });

        onPlayer('play', () => this.showControls());
        onPlayer('pause', () => this.showControls());
        onPlayer('ended', () => {
            // `ended` does not reliably fire `pause` in every browser, so the
            // play button and poster overlay are reset explicitly.
            this.updatePlayBtn(true);
            this.bigPlayBtn.style.display = '';
            this.showControls();
        });

        // Initial state
        const s = this.player.getState();
        this.updatePlayBtn(s.paused);
        this.bigPlayBtn.style.display = s.paused ? '' : 'none';
        this.volRange.value = String(s.muted ? 0 : s.volume);
        this.volRange.style.setProperty('--volume-percent', `${(s.muted ? 0 : s.volume) * 100}%`);
        this.updateMuteBtn(s.muted, s.volume);
        this.updateTimeDisplay(s.currentTime, s.duration);
        this.showControls();
    }

    /**
     * Reveals the control bar and restarts the idle countdown. Called on any
     * pointer or focus activity inside the player.
     */
    showControls() {
        this.player.getContainer().classList.remove('ap-controls-hidden');
        if (this.hideTimer) clearTimeout(this.hideTimer);
        this.hideTimer = null;

        const delay = this.options.autoHideDelay ?? 2800;
        if (delay <= 0) return;
        this.hideTimer = setTimeout(() => {
            this.hideTimer = null;
            this.hideControls();
        }, delay);
    }

    /**
     * Hides the bar, unless something on screen still needs it: playback is
     * paused, the pointer is over the bar, focus is inside it, the settings
     * menu is open, or a host has pinned it with `setKeepVisible(true)`.
     */
    hideControls() {
        if (this.keepVisible) return;
        if (this.player.getState().paused) return;

        const container = this.player.getContainer();
        if (this.element.matches(':hover')) return;
        if (this.element.contains(document.activeElement)) return;
        // The settings menu lives beside the bar and would be orphaned by a
        // hide; `.ap-overlay-open` is the class Menu sets while it is showing.
        if (container.querySelector('.ap-overlay-open')) return;

        container.classList.add('ap-controls-hidden');
    }

    /** Pins the control bar open (e.g. while a host-owned panel is showing). */
    setKeepVisible(keep: boolean) {
        this.keepVisible = keep;
        if (keep) this.showControls();
    }

    private updateMuteBtn(muted: boolean, volume: number) {
        const silent = muted || volume === 0;
        this.muteBtn.innerHTML = '';
        this.muteBtn.appendChild(createSVG(silent ? this.icons.volumeMute : this.icons.volumeOn));
        this.muteBtn.setAttribute('aria-label', silent ? 'Unmute' : 'Mute');
    }

    private togglePlay() {
        if (this.player.getState().paused) this.player.play();
        else this.player.pause();
    }

    private updatePlayBtn(paused: boolean) {
        this.playBtn.innerHTML = '';
        this.playBtn.appendChild(createSVG(paused ? this.icons.play : this.icons.pause));
        this.playBtn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    }

    private updateTimeDisplay(time?: number, duration?: number) {
        if (time === undefined) {
            const state = this.player.getState();
            time = state.currentTime;
            duration = state.duration;
        }
        
        const t = time ?? 0;
        const d = duration ?? 0;
        
        switch (this.timeFormat) {
            case 'elapsed': {
                this.timeDisplay.textContent = `${formatTime(t)} / ${formatTime(d)}`;
                break;
            }
            case 'remaining': {
                const remaining = Math.max(0, d - t);
                this.timeDisplay.textContent = `-${formatTime(remaining)} / ${formatTime(d)}`;
                break;
            }
        }

        this.progressContainer.setAttribute('aria-valuemax', String(Math.floor(d)));
        this.progressContainer.setAttribute('aria-valuenow', String(Math.floor(t)));
        this.progressContainer.setAttribute('aria-valuetext', `${formatTime(t)} of ${formatTime(d)}`);
    }

    private showFeedback(iconContent: string | HTMLElement) {
        if (!iconContent) return;

        // Clear existing
        this.feedbackOverlay.innerHTML = '';
        this.feedbackOverlay.style.opacity = '0';

        // Create icon wrapper
        const icon = createSVG(iconContent, { size: 48, color: "var(--ap-on-surface)" }); // Bigger size for feedback
        this.feedbackOverlay.appendChild(icon);

        // Animate
        // Force reflow
        void this.feedbackOverlay.offsetWidth;

        this.feedbackOverlay.style.opacity = '1';
        this.feedbackOverlay.style.transform = 'translate(-50%, -50%) scale(1)';

        if (this.feedbackTimeout) clearTimeout(this.feedbackTimeout);
        this.feedbackTimeout = setTimeout(() => {
            this.feedbackOverlay.style.opacity = '0';
            this.feedbackOverlay.style.transform = 'translate(-50%, -50%) scale(1.1)';
        }, 500);
    }

    public getSettingsButton(): HTMLElement {
        return this.settingsBtn;
    }

    public addButton(side: 'left' | 'right', content: string | HTMLElement, onClick: () => void, options: { className?: string; label?: string } = {}): HTMLElement {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `ctrl btn ${options.className || ''}`.trim();
        if (options.label) btn.setAttribute("aria-label", options.label);
        btn.appendChild(createSVG(content));
        btn.onclick = (e) => {
            e.stopPropagation();
            onClick();
        };

        const row = this.element.querySelector(side === 'left' ? '.controls-left' : '.controls-right');
        if (row) {
            // If right side, assume settings/fullscreen are at the end, so we prepend or append?
            // Usually custom buttons go before Settings.
            if (side === 'right') {
                if (this.settingsBtn && this.settingsBtn.parentNode === row) {
                    row.insertBefore(btn, this.settingsBtn);
                } else {
                    row.appendChild(btn);
                }
            } else {
                row.appendChild(btn);
            }
        }
        return btn;
    }
}

