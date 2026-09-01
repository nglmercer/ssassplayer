import { ICONS, createSVG } from "./icons";

export type MenuIcon = string | HTMLElement;

export type MenuEntry =
  | {
    type: "toggle";
    id: string;
    label: string;
    icon?: MenuIcon;
    value: boolean;
    onChange: (v: boolean) => void;
  }
  | {
    type: "select";
    id: string;
    label: string;
    icon?: MenuIcon;
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (v: string) => void;
  }
  | {
    type: "action";
    id: string;
    label: string;
    icon?: MenuIcon;
    onClick: () => void;
  };

/** @deprecated Use {@link MenuEntry}. Kept so existing imports keep compiling. */
export type MenuItem = MenuEntry;

export interface MenuGroup {
  label: string;
  items: MenuEntry[];
}

export interface MenuOptions {
  className?: string;
}

export class Dropdown {
  private element: HTMLElement;
  private isOpen = false;
  private onClose?: () => void;

  constructor(className: string = "") {
    this.element = document.createElement("div");
    this.element.className = `ap-dropdown ${className}`.trim();
    // Start hidden: without this the element is visible from the moment it is
    // appended, until the first toggle().
    this.element.style.display = "none";
  }

  open() {
    this.isOpen = true;
    this.element.style.display = "block";
    this.element.classList.add("ap-dropdown-open");
  }

  close() {
    this.isOpen = false;
    this.element.style.display = "none";
    this.element.classList.remove("ap-dropdown-open");
    this.onClose?.();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  getElement() {
    return this.element;
  }
  isDropdownOpen() {
    return this.isOpen;
  }
  setOnClose(callback: () => void) {
    this.onClose = callback;
  }
}

export class Menu {
  readonly root: HTMLElement;
  private overlay: HTMLElement;
  private panel: HTMLElement;
  private subpanel: HTMLElement;
  private groups: MenuGroup[] = [];
  private activeSelectItem?: Extract<MenuEntry, { type: "select" }>;
  private subpanelOpen = false;
  private isOpen = false;
  private listeners = new AbortController();
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    root: HTMLElement,
    groups: MenuGroup[],
    options: MenuOptions = {},
  ) {
    this.root = root;
    this.overlay = document.createElement("div");
    this.panel = document.createElement("div");
    this.subpanel = document.createElement("div");
    this.overlay.className = "ap-overlay";
    this.panel.className = "ap-panel";
    this.subpanel.className = "ap-subpanel";
    if (options.className) this.panel.className += " " + options.className;

    this.overlay.setAttribute("role", "dialog");
    this.overlay.setAttribute("aria-modal", "true");
    this.panel.setAttribute("role", "menu");
    this.subpanel.setAttribute("role", "menu");

    const { signal } = this.listeners;

    // Enhanced overlay click handling
    this.overlay.addEventListener(
      "click",
      (e) => {
        if (e.target === this.overlay) this.close();
      },
      { signal },
    );

    // Back out of the sub-panel (then the whole menu) on Escape.
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape" || !this.isOpen) return;
        e.preventDefault();
        if (this.subpanelOpen) this.closeSubpanel();
        else this.close();
      },
      { signal },
    );

    this.overlay.appendChild(this.panel);
    this.overlay.appendChild(this.subpanel);
    this.root.appendChild(this.overlay);
    this.setGroups(groups);
    this.close();
  }

  setGroups(groups: MenuGroup[]) {
    this.groups = groups;
    this.renderMain();
  }

  open() {
    this.isOpen = true;
    this.overlay.classList.add("ap-overlay-open");
  }

  close() {
    this.isOpen = false;
    this.overlay.classList.remove("ap-overlay-open");
    this.closeSubpanel();
    this.subpanel.innerHTML = "";
    this.activeSelectItem = undefined;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  isMenuOpen() {
    return this.isOpen;
  }

  private openSubpanel() {
    this.subpanelOpen = true;
    this.panel.classList.add("ap-panel-hidden");
    this.subpanel.classList.add("ap-subpanel-visible");
  }

  private closeSubpanel() {
    this.subpanelOpen = false;
    this.panel.classList.remove("ap-panel-hidden");
    this.subpanel.classList.remove("ap-subpanel-visible");
    // Empty the sub-panel only once the slide-out transition has finished.
    this.defer(() => {
      if (!this.subpanelOpen) this.subpanel.innerHTML = "";
    }, 400);
  }

  /** setTimeout that is cancelled by `destroy()`. */
  private defer(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  /** Detaches listeners, cancels timers and removes the menu from the DOM. */
  destroy() {
    this.listeners.abort();
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    this.overlay.remove();
  }

  private renderMain() {
    this.panel.innerHTML = "";
    for (const g of this.groups) {
      const h = document.createElement("div");
      h.className = "ap-group-title";
      h.textContent = g.label;
      this.panel.appendChild(h);
      for (const item of g.items) this.panel.appendChild(this.renderItem(item));
    }
  }

  private renderItem(item: MenuEntry) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "ap-row";
    const left = document.createElement("div");
    left.className = "ap-left";
    const right = document.createElement("div");
    right.className = "ap-right";
    const label = document.createElement("span");
    label.className = "ap-label";
    label.textContent = item.label;
    left.appendChild(this.iconEl(item.icon));
    left.appendChild(label);
    row.appendChild(left);
    row.appendChild(right);

    row.setAttribute("role", "menuitem");

    if (item.type === "toggle") {
      row.setAttribute("role", "menuitemcheckbox");
      row.setAttribute("aria-checked", String(item.value));
      const toggle = document.createElement("span");
      toggle.className = "ap-toggle" + (item.value ? " ap-toggle-on" : "");
      right.appendChild(toggle);
      row.onclick = (e) => {
        e.stopPropagation();
        item.value = !item.value;
        toggle.className = "ap-toggle" + (item.value ? " ap-toggle-on" : "");
        row.setAttribute("aria-checked", String(item.value));
        item.onChange(item.value);
      };
    } else if (item.type === "select") {
      const val = document.createElement("span");
      val.className = "ap-value";
      val.textContent =
        item.options.find((o) => o.value === item.value)?.label || "";
      const arrow = document.createElement("span");
      arrow.className = "ap-arrow";
      arrow.appendChild(createSVG(ICONS.menuArrow, { size: 16, color: "var(--ap-on-surface-variant)" }));
      right.appendChild(val);
      right.appendChild(arrow);
      row.setAttribute("aria-haspopup", "true");
      row.onclick = (e) => {
        e.stopPropagation();
        this.openSelect(item);
      };
    } else {
      row.onclick = (e) => {
        e.stopPropagation();
        item.onClick();
      };
    }
    return row;
  }

  private openSelect(item: Extract<MenuEntry, { type: "select" }>) {
    // Clicking the select row that is already open closes the sub-panel again.
    // (This used to read `subpanel.style.display`, which CSS pins to `block`
    // with `!important`, so the branch could never be taken.)
    if (this.activeSelectItem === item && this.subpanelOpen) {
      this.closeSubpanel();
      this.activeSelectItem = undefined;
      return;
    }

    this.activeSelectItem = item;
    this.subpanel.innerHTML = "";

    // Header with Back Button
    const header = document.createElement("div");
    header.className = "ap-menu-header";

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "ap-back-btn";
    backBtn.appendChild(createSVG(ICONS.menuBack, { size: 16, color: "var(--ap-on-surface-variant)" }));
    backBtn.onclick = (e) => {
      e.stopPropagation();
      this.closeSubpanel();
    };

    const title = document.createElement("div");
    title.className = "ap-menu-title";
    title.textContent = item.label;

    header.appendChild(backBtn);
    header.appendChild(title);
    this.subpanel.appendChild(header);

    for (const opt of item.options) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "ap-row";
      const left = document.createElement("div");
      left.className = "ap-left";
      const right = document.createElement("div");
      right.className = "ap-right";
      const label = document.createElement("span");
      label.className = "ap-label";
      label.textContent = opt.label;
      const check = document.createElement("span");
      const selected = opt.value === item.value;
      check.className = "ap-check" + (selected ? " ap-check-on" : "");
      check.appendChild(createSVG(ICONS.check, { size: 14, color: "var(--ap-primary)" }));
      row.setAttribute("role", "menuitemradio");
      row.setAttribute("aria-checked", String(selected));
      left.appendChild(label);
      right.appendChild(check);
      row.appendChild(left);
      row.appendChild(right);
      row.onclick = (e) => {
        e.stopPropagation();
        item.value = opt.value;
        item.onChange(opt.value);
        this.renderMain();

        // Update selection UI immediately in subpanel
        this.subpanel.querySelectorAll(".ap-check").forEach(c => c.classList.remove("ap-check-on"));
        this.subpanel.querySelectorAll(".ap-row").forEach(r => {
          r.classList.remove("ap-row-selected");
          r.setAttribute("aria-checked", "false");
        });
        check.classList.add("ap-check-on");
        row.classList.add("ap-row-selected");
        row.setAttribute("aria-checked", "true");

        // Delayed close for better UX
        this.defer(() => {
          this.closeSubpanel();
          this.activeSelectItem = undefined;
        }, 300);
      };
      if (opt.value === item.value) row.classList.add("ap-row-selected");
      this.subpanel.appendChild(row);
    }

    this.open();

    // One frame later, so the browser has a chance to paint the initial
    // (translated / transparent) state and actually run the transition.
    requestAnimationFrame(() => this.openSubpanel());
  }

  private iconEl(icon?: MenuIcon) {
    const span = document.createElement("span");
    span.className = "ap-icon";
    if (!icon) return span;
    if (typeof icon === "string") {
      if (ICONS[icon as keyof typeof ICONS]) {
        span.appendChild(createSVG(ICONS[icon as keyof typeof ICONS]));
      } else {
        span.innerHTML = icon;
      }
    } else span.appendChild(icon);
    return span;
  }
}
