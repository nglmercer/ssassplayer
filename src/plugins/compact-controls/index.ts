import { Player } from "../../player";
import {
  IPlayer,
  PluginAPI,
  PlayerPluginInstance,
  PluginManifest,
} from "../../types";
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

const DEFAULT_ICONS: Record<string, string> = {
  prev: ICONS.skipPrev,
  next: ICONS.skipNext,
  back: ICONS.back,
  forward: ICONS.forward,
  skipPrev: ICONS.skipPrev,
  skipNext: ICONS.skipNext,
};

export function createCompactControls(
  options: CompactControlsOptions = {},
): PluginManifest {
  return {
    name: "compact-controls",
    version: "1.0.0",
    description:
      "Compact overlay controls with custom action buttons for small screens",
    factory: (player: IPlayer, api: PluginAPI) =>
      new CompactControls(player as Player, api, options),
  };
}

export class CompactControls implements PlayerPluginInstance {
  element!: HTMLElement;
  private player: Player;
  private breakpoint: number;
  private isCompact = false;
  private resizeObserver: ResizeObserver | null = null;
  private playBtn!: HTMLElement;
  private buttonsContainer!: HTMLElement;
  private customButtons: CompactButton[] = [];

  constructor(
    player: Player,
    _api: PluginAPI,
    options: CompactControlsOptions = {},
  ) {
    this.player = player;
    this.breakpoint = options.breakpoint ?? 480;
    this.customButtons = options.buttons ?? [];
  }

  async install() {
    this.element = this.createDOM();
    this.player.getContainer().appendChild(this.element);
    this.bindEvents();
    this.checkSize();
    this.startObserving();
  }

  dispose() {
    if (this.element?.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.resizeObserver?.disconnect();
  }

  private createDOM(): HTMLElement {
    const controls = document.createElement("div");
    controls.className = "compact-controls";

    this.buttonsContainer = document.createElement("div");
    this.buttonsContainer.className = "cc-buttons";

    this.renderButtons();

    controls.appendChild(this.buttonsContainer);
    return controls;
  }

  private renderButtons() {
    this.buttonsContainer.innerHTML = "";

    const visibleButtons = this.customButtons.filter(
      (b) => b.visible !== false,
    );

    const leftButtons = visibleButtons.filter(
      (b) => b.id === "prev" || b.id === "back" || b.id === "skipPrev",
    );
    const rightButtons = visibleButtons.filter(
      (b) => b.id !== "prev" && b.id !== "back" && b.id !== "skipPrev",
    );

    for (const btn of leftButtons) {
      this.buttonsContainer.appendChild(this.createButtonElement(btn));
    }

    this.playBtn = document.createElement("button");
    this.playBtn.className = "cc-btn cc-play";
    this.playBtn.appendChild(createSVG(ICONS.play));
    this.playBtn.onclick = (e) => {
      e.stopPropagation();
      this.player.getState().paused ? this.player.play() : this.player.pause();
    };
    this.buttonsContainer.appendChild(this.playBtn);

    for (const btn of rightButtons) {
      this.buttonsContainer.appendChild(this.createButtonElement(btn));
    }
  }

  private createButtonElement(btn: CompactButton): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = `cc-btn cc-btn-${btn.id}`;
    button.title = btn.tooltip ?? btn.id;

    const icon = btn.icon ?? DEFAULT_ICONS[btn.id] ?? ICONS.play;
    button.appendChild(createSVG(icon));

    button.onclick = (e) => {
      e.stopPropagation();
      btn.onClick(this.player);
    };

    return button;
  }

  private bindEvents() {
    this.player.on("play", () => this.updatePlayIcon(false));
    this.player.on("pause", () => this.updatePlayIcon(true));

    this.player.on("pause", () => {
      if (this.isCompact) {
        this.element.classList.add("visible");
      }
    });

    let hideTimeout: number;
    this.player.on("play", () => {
      clearTimeout(hideTimeout);
      hideTimeout = window.setTimeout(() => {
        this.element.classList.remove("visible");
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
    const containerWidth =
      width ?? this.player.getContainer().getBoundingClientRect().width;
    const shouldBeCompact = containerWidth < this.breakpoint;

    if (shouldBeCompact !== this.isCompact) {
      this.isCompact = shouldBeCompact;
      this.element.classList.toggle("active", this.isCompact);

      if (this.isCompact && this.player.getState().paused) {
        this.element.classList.add("visible");
      }
    }
  }

  private updatePlayIcon(paused: boolean) {
    if (!this.playBtn) return;
    this.playBtn.innerHTML = "";
    this.playBtn.appendChild(createSVG(paused ? ICONS.play : ICONS.pause));
  }

  public addButton(button: CompactButton) {
    this.customButtons.push(button);
    this.renderButtons();
  }

  public removeButton(id: string) {
    this.customButtons = this.customButtons.filter((b) => b.id !== id);
    this.renderButtons();
  }
}
