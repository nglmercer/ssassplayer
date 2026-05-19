import { Player } from "../player";
import { IPlayer, PluginAPI, PlayerPluginInstance, PluginManifest } from "../types";
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
    private scrubber!: HTMLElement;
    private previewTooltip!: HTMLElement;
    private previewThumbnail!: HTMLElement;
    private previewTime!: HTMLElement;
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
    private feedbackTimeout: number | null = null;

    constructor(player: Player, api: PluginAPI, options: ControlsOptions = {}) {
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
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        if (this.feedbackOverlay && this.feedbackOverlay.parentNode) {
            this.feedbackOverlay.parentNode.removeChild(this.feedbackOverlay);
        }
        if (this.bigPlayBtn && this.bigPlayBtn.parentNode) {
            this.bigPlayBtn.parentNode.removeChild(this.bigPlayBtn);
        }
        if (this.loader && this.loader.parentNode) {
            this.loader.parentNode.removeChild(this.loader);
        }
    }

    private createDOM(): HTMLElement {
        const controls = document.createElement("div");
        controls.className = "controls";

        // Feedback Overlay (Visual Bezel)
        this.feedbackOverlay = document.createElement("div");
        this.feedbackOverlay.className = "feedback-overlay";
        // We append it to the player container (parent of controls), not controls itself usually, to center over video
        // But the constructor takes container. Let's append to container if we can, or controls parent.
        // Actually, let's append to the passed container (which is player wrapper)
        this.player.getContainer().appendChild(this.feedbackOverlay);

        // Big Play Button (Initial/Paused State)
        this.bigPlayBtn = document.createElement("div");
        this.bigPlayBtn.className = "ap-big-play";
        this.bigPlayBtn.appendChild(createSVG(this.icons.playBig, { size: 64, color: "var(--ap-on-surface)" }));
        this.player.getContainer().appendChild(this.bigPlayBtn);

        // Loader Spinner
        this.loader = document.createElement("div");
        this.loader.className = "ap-loader";
        this.loader.appendChild(createSVG(this.icons.loading, { size: 64, color: "var(--ap-primary)" }));
        this.player.getContainer().appendChild(this.loader);

        // Progress
        const progRow = document.createElement("div");
        progRow.className = "controls-progress";

        this.progressContainer = document.createElement("div");
        this.progressContainer.className = "progress-container";
        this.progressContainer.tabIndex = 0; // Focusable

        this.progressBar = document.createElement("div");
        this.progressBar.className = "progress-bar";

        this.progressLoaded = document.createElement("div");
        this.progressLoaded.className = "progress-loaded";
        this.progressPlayed = document.createElement("div");
        this.progressPlayed.className = "progress-played";

        this.scrubber = document.createElement("div");
        this.scrubber.className = "scrubber";

        // Preview Tooltip
        this.previewTooltip = document.createElement("div");
        this.previewTooltip.className = "preview-tooltip";

        this.previewThumbnail = document.createElement("div");
        this.previewThumbnail.className = "preview-thumbnail";

        this.previewTime = document.createElement("div");
        this.previewTime.className = "preview-time";
        this.previewTime.textContent = "0:00";

        this.previewTooltip.appendChild(this.previewThumbnail);
        this.previewTooltip.appendChild(this.previewTime);

        this.progressBar.appendChild(this.progressLoaded);
        this.progressBar.appendChild(this.progressPlayed);
        this.progressPlayed.appendChild(this.scrubber);

        this.progressContainer.appendChild(this.progressBar);
        this.progressContainer.appendChild(this.previewTooltip);
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
        this.playBtn.appendChild(createSVG(this.icons.play));
        left.appendChild(this.playBtn);

        const volContainer = document.createElement("div");
        volContainer.className = "volume-container";
        this.muteBtn = document.createElement("button");
        this.muteBtn.className = "ctrl btn";
        this.muteBtn.appendChild(createSVG(this.icons.volumeOn));

        this.volRange = document.createElement("input");
        this.volRange.type = "range";
        this.volRange.className = "ctrl";
        this.volRange.min = "0";
        this.volRange.max = "1";
        this.volRange.step = "0.05";
        this.volRange.value = "1";
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
        this.timeDisplay.style.cursor = "pointer";
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
        this.settingsBtn.appendChild(createSVG(this.icons.settings));
        right.appendChild(this.settingsBtn);

        this.fullscreenBtn = document.createElement("button");
        this.fullscreenBtn.className = "ctrl btn";
        this.fullscreenBtn.appendChild(createSVG(this.icons.fullscreen));
        right.appendChild(this.fullscreenBtn);

        mainRow.appendChild(right);
        controls.appendChild(mainRow);

        return controls;
    }

    private bindEvents() {
        // Big Play Button
        this.bigPlayBtn.onclick = (e) => {
            e.stopPropagation();
            this.togglePlay();
        };

        // Play/Pause override to show feedback
        this.playBtn.onclick = (e) => {
            e.stopPropagation(); // prevent bubbling to container click if any
            this.togglePlay();
        };

        // Note: Click on video to toggle play is removed to avoid conflict with Gestures.
        // If gestures are not used, one might want to re-enable this or use a separate ClickPlugin.


        this.muteBtn.onclick = () => {
            const s = this.player.getState();
            this.player.setMuted(!s.muted);
        };

        this.volRange.oninput = (e) => {
            const v = parseFloat((e.target as HTMLInputElement).value);
            this.player.setVolume(v);
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

        // Seeking
        let isDragging = false;

        // Hover Preview
        this.progressContainer.addEventListener('mousemove', (e) => {
            this.showPreview(e.clientX);
        });

        this.progressContainer.addEventListener('mouseleave', () => {
            this.previewTooltip.style.opacity = '0';
        });

        const updateScrubber = (clientX: number) => {
            const rect = this.progressContainer.getBoundingClientRect();
            const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const duration = this.player.getState().duration || 0;
            const time = pos * duration;

            // Update UI immediately (visual feedback)
            this.progressPlayed.style.width = `${pos * 100}%`;
            this.updateTimeDisplay(time, duration);

            return time;
        };

        const seek = (e: MouseEvent | TouchEvent) => {
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
            const targetTime = updateScrubber(clientX);
            this.player.seek(targetTime);
        };

        this.progressContainer.addEventListener('mousedown', (e) => {
            isDragging = true;
            // Don't seek immediately on mousedown? users prefer click-to-seek, drag-to-scrub.
            // standard: mousedown seeks immediately too.
            seek(e);
        });

        document.addEventListener('mousemove', (e: MouseEvent | TouchEvent) => {
            if (isDragging) {
                const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
                updateScrubber(clientX); // Just visual update during drag?
                // Or seek? seeking continuously can be heavy.
                // Better: update visual, seek heavily throttled or only on mouseup. 
                // BUT user wants "scrubber follows cursor".
                // We'll do BOTH: visual update forces scrubber to cursor, seek happens.
                seek(e);
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                seek(e); // Final seek
            }
        });

        // Player Events
        this.player.on('play', () => {
            this.updatePlayBtn(false);
            this.showFeedback(this.icons.playBig);
            this.bigPlayBtn.style.display = 'none';
        });
        this.player.on('pause', () => {
            this.updatePlayBtn(true);
            this.showFeedback(this.icons.pauseBig);
            this.bigPlayBtn.style.display = '';
        });

        this.player.on('volumechange', (vol: number, muted: boolean) => {
            this.volRange.value = vol.toString();
            this.volRange.style.setProperty('--volume-percent', `${vol * 100}%`);
            this.muteBtn.innerHTML = '';
            this.muteBtn.appendChild(createSVG(muted || vol === 0 ? this.icons.volumeMute : this.icons.volumeOn));
        });

        this.player.on('timeupdate', (time: number, duration: number) => {
            if (!isDragging) {
                const pct = duration > 0 ? (time / duration) * 100 : 0;
                this.progressPlayed.style.width = `${pct}%`;
                this.updateTimeDisplay(time, duration);
            }
        });

        this.player.on('progress', (buffered: number, duration: number) => {
            const pct = duration > 0 ? (buffered / duration) * 100 : 0;
            this.progressLoaded.style.width = `${pct}%`;
        });

        this.player.on('fullscreenchange', (isFull: boolean) => {
            this.fullscreenBtn.innerHTML = '';
            this.fullscreenBtn.appendChild(createSVG(isFull ? this.icons.exitFullscreen : this.icons.fullscreen));
        });

        // Loading events
        this.player.on('waiting', () => this.loader.classList.add('visible'));
        this.player.on('stalled', () => this.loader.classList.add('visible'));
        this.player.on('canplay', () => this.loader.classList.remove('visible'));
        this.player.on('canplaythrough', () => this.loader.classList.remove('visible'));
        this.player.on('playing', () => this.loader.classList.remove('visible'));
        this.player.on('seeking', () => this.loader.classList.add('visible'));
        this.player.on('seeked', () => this.loader.classList.remove('visible'));

        // Initial state
        const paused = this.player.getState().paused;
        this.updatePlayBtn(paused);
        this.bigPlayBtn.style.display = paused ? '' : 'none';
        const s = this.player.getState();
        this.volRange.value = s.volume.toString();
        this.volRange.style.setProperty('--volume-percent', `${s.volume * 100}%`);
        this.muteBtn.innerHTML = '';
        this.muteBtn.appendChild(createSVG(s.muted || s.volume === 0 ? this.icons.volumeMute : this.icons.volumeOn));
    }

    private togglePlay() {
        if (this.player.getState().paused) this.player.play();
        else this.player.pause();
    }

    private updatePlayBtn(paused: boolean) {
        this.playBtn.innerHTML = '';
        this.playBtn.appendChild(createSVG(paused ? this.icons.play : this.icons.pause));
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
            case 'elapsed':
                this.timeDisplay.textContent = `${formatTime(t)} / ${formatTime(d)}`;
                break;
            case 'remaining':
                const remaining = Math.max(0, d - t);
                this.timeDisplay.textContent = `-${formatTime(remaining)} / ${formatTime(d)}`;
                break;
        }
    }

    private showPreview(clientX: number) {
        const rect = this.progressContainer.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const duration = this.player.getState().duration || 0;
        const time = pos * duration;

        const thumbnailProvider = this.player.getAPI().getThumbnailProvider();
        const thumbnail = thumbnailProvider?.getThumbnailAtTime(time);

        if (thumbnail && thumbnail.url) {
            this.previewTooltip.classList.remove('no-thumbnail');

            const thumbWidth = thumbnail.width || 160;
            const thumbHeight = thumbnail.height || 90;

            this.previewThumbnail.style.width = `${thumbWidth}px`;
            this.previewThumbnail.style.height = `${thumbHeight}px`;
            this.previewThumbnail.style.backgroundImage = `url('${thumbnail.url}')`;
            this.previewThumbnail.style.backgroundSize = `${thumbWidth * 10}px ${thumbHeight * 10}px`;
            this.previewThumbnail.style.backgroundPosition = `-${thumbnail.x}px -${thumbnail.y}px`;

            this.previewTooltip.style.left = `${pos * 100}%`;
            this.previewTooltip.style.opacity = '1';
        } else {
            this.previewTooltip.classList.add('no-thumbnail');
            this.previewTooltip.style.left = `${pos * 100}%`;
            this.previewTooltip.style.opacity = '1';
        }

        this.previewTime.textContent = formatTime(time);
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

        if (this.feedbackTimeout) window.clearTimeout(this.feedbackTimeout);
        this.feedbackTimeout = window.setTimeout(() => {
            this.feedbackOverlay.style.opacity = '0';
            this.feedbackOverlay.style.transform = 'translate(-50%, -50%) scale(1.1)';
        }, 500);
    }

    public getSettingsButton(): HTMLElement {
        return this.settingsBtn;
    }

    public addButton(side: 'left' | 'right', content: string | HTMLElement, onClick: () => void, options: { className?: string } = {}): HTMLElement {
        const btn = document.createElement("button");
        btn.className = `ctrl btn ${options.className || ''}`;
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

