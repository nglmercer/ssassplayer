import { Player } from "../../player";
import { IPlayer, PluginAPI, PlayerPluginInstance, PluginManifest } from "../../types";
import { ICONS, createSVG } from "../../ui/icons";

export interface CompactButton {
    id: string;
    icon?: string | HTMLElement;
    tooltip?: string;
    onClick: (player: Player) => void;
    visible?: boolean;
}

export interface CompactControlsOptions {
    breakpoint?: number;
    buttons?: CompactButton[];
}

export function createCompactControls(options: CompactControlsOptions = {}): PluginManifest {
    return {
        name: "compact-controls",
        version: "1.0.0",
        description: "Compact overlay controls with custom action buttons for small screens",
        factory: (player: IPlayer, api: PluginAPI) => new CompactControls(player as Player, api, options),
    };
}

export class CompactControls implements PlayerPluginInstance {
    element!: HTMLElement;
    private player: Player;
    private options: CompactControlsOptions;
    private breakpoint: number;
    private isCompact = false;
    private resizeObserver: ResizeObserver | null = null;
    private playBtn!: HTMLElement;
    private buttonsContainer!: HTMLElement;
    private buttons: CompactButton[] = [];

    constructor(player: Player, api: PluginAPI, options: CompactControlsOptions = {}) {
        this.player = player;
        this.options = options;
        this.breakpoint = options.breakpoint || 480;
    }

    async install() {
        this.setupButtons();
        this.element = this.createDOM();
        this.player.getContainer().appendChild(this.element);
        this.bindEvents();
        this.checkSize();
        this.startObserving();
    }

    private setupButtons() {
        const defaultButtons: CompactButton[] = [
            {
                id: 'prev',
                icon: ICONS.skipPrev,
                tooltip: 'Back 10s',
                onClick: () => {
                    this.player.seek(Math.max(this.player.getState().currentTime - 10, 0));
                }
            },
            {
                id: 'next',
                icon: ICONS.skipNext,
                tooltip: 'Forward 10s',
                onClick: () => {
                    const duration = this.player.getState().duration;
                    this.player.seek(Math.min(this.player.getState().currentTime + 10, duration));
                }
            }
        ];

        this.buttons = this.options.buttons || defaultButtons;
    }

    dispose() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
    }

    private createDOM(): HTMLElement {
        const controls = document.createElement("div");
        controls.className = "compact-controls";

        this.buttonsContainer = document.createElement("div");
        this.buttonsContainer.className = "cc-buttons";

        // Custom action buttons (left side - prev)
        const leftButtons = this.buttons.filter(b => b.id === 'prev' && b.visible !== false);
        for (const btn of leftButtons) {
            const button = document.createElement("button");
            button.className = `cc-btn cc-btn-${btn.id}`;
            button.title = btn.tooltip || btn.id;
            button.appendChild(createSVG(btn.icon || ICONS.play));
            button.onclick = (e) => {
                e.stopPropagation();
                btn.onClick(this.player);
            };
            this.buttonsContainer.appendChild(button);
        }

        // Play/Pause button (center)
        this.playBtn = document.createElement("button");
        this.playBtn.className = "cc-btn cc-play";
        this.playBtn.appendChild(createSVG(ICONS.play));
        this.playBtn.onclick = (e) => {
            e.stopPropagation();
            if (this.player.getState().paused) this.player.play();
            else this.player.pause();
        };
        this.buttonsContainer.appendChild(this.playBtn);

        // Custom action buttons (right side - next)
        const rightButtons = this.buttons.filter(b => b.id !== 'prev' && b.visible !== false);
        for (const btn of rightButtons) {
            const button = document.createElement("button");
            button.className = `cc-btn cc-btn-${btn.id}`;
            button.title = btn.tooltip || btn.id;
            button.appendChild(createSVG(btn.icon || ICONS.play));
            button.onclick = (e) => {
                e.stopPropagation();
                btn.onClick(this.player);
            };
            this.buttonsContainer.appendChild(button);
        }

        controls.appendChild(this.buttonsContainer);

        return controls;
    }

    private bindEvents() {
        // Sync play/pause icon with player state
        this.player.on('play', () => this.updatePlayIcon(false));
        this.player.on('pause', () => this.updatePlayIcon(true));
        
        // Show controls when paused
        this.player.on('pause', () => {
            if (this.isCompact) {
                this.element.classList.add('visible');
            }
        });
        
        // Hide controls when playing (after a delay)
        let hideTimeout: number;
        this.player.on('play', () => {
            if (hideTimeout) clearTimeout(hideTimeout);
            hideTimeout = window.setTimeout(() => {
                this.element.classList.remove('visible');
            }, 2000);
        });
    }

    private startObserving() {
        const container = this.player.getContainer();
        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                this.checkSize(entry.contentRect.width);
            }
        });
        this.resizeObserver.observe(container);
    }

    private checkSize(width?: number) {
        const containerWidth = width || this.player.getContainer().getBoundingClientRect().width;
        const shouldBeCompact = containerWidth < this.breakpoint;

        if (shouldBeCompact !== this.isCompact) {
            this.isCompact = shouldBeCompact;
            this.element.classList.toggle('active', this.isCompact);
            
            // Show controls immediately when switching to compact and paused
            if (this.isCompact && this.player.getState().paused) {
                this.element.classList.add('visible');
            }
        }
    }

    private updatePlayIcon(paused: boolean) {
        if (!this.playBtn) return;
        this.playBtn.innerHTML = '';
        this.playBtn.appendChild(createSVG(paused ? ICONS.play : ICONS.pause));
    }

    public addButton(button: CompactButton) {
        this.buttons.push(button);
        this.refreshButtons();
    }

    public removeButton(id: string) {
        this.buttons = this.buttons.filter(b => b.id !== id);
        this.refreshButtons();
    }

    private refreshButtons() {
        if (!this.buttonsContainer || !this.playBtn) return;
        
        // Clear and rebuild
        this.buttonsContainer.innerHTML = '';
        
        // Left buttons (prev)
        const leftButtons = this.buttons.filter(b => b.id === 'prev' && b.visible !== false);
        for (const btn of leftButtons) {
            const button = document.createElement("button");
            button.className = `cc-btn cc-btn-${btn.id}`;
            button.title = btn.tooltip || btn.id;
            button.appendChild(createSVG(btn.icon || ICONS.play));
            button.onclick = (e) => {
                e.stopPropagation();
                btn.onClick(this.player);
            };
            this.buttonsContainer.appendChild(button);
        }
        
        // Play button (center)
        this.buttonsContainer.appendChild(this.playBtn);
        
        // Right buttons (next and others)
        const rightButtons = this.buttons.filter(b => b.id !== 'prev' && b.visible !== false);
        for (const btn of rightButtons) {
            const button = document.createElement("button");
            button.className = `cc-btn cc-btn-${btn.id}`;
            button.title = btn.tooltip || btn.id;
            button.appendChild(createSVG(btn.icon || ICONS.play));
            button.onclick = (e) => {
                e.stopPropagation();
                btn.onClick(this.player);
            };
            this.buttonsContainer.appendChild(button);
        }
    }
}
