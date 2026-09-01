import { Menu, type MenuGroup, type MenuOptions } from './menu';
import { Gestures, type GestureOptions } from './gestures';
import { Player } from '../player';

export class APMenuElement extends HTMLElement {
  menu?: Menu;

  /** Builds the menu inside `root` (defaults to this element). */
  init(root: HTMLElement, groups: MenuGroup[], options?: MenuOptions) {
    this.menu?.destroy();
    this.menu = new Menu(root ?? this, groups, options);
    return this.menu;
  }
  open() { this.menu?.open(); }
  close() { this.menu?.close(); }
  toggle() { this.menu?.toggle(); }
  setGroups(groups: MenuGroup[]) { this.menu?.setGroups(groups); }

  disconnectedCallback() {
    this.menu?.destroy();
    this.menu = undefined;
  }
}

export class APGesturesElement extends HTMLElement {
  gestures?: Gestures;

  /**
   * Creates and installs the gesture layer. `install()` is what attaches the
   * listeners and overlay elements, so it must be awaited by callers that need
   * the layer to be live immediately.
   */
  async init(player: Player, options?: GestureOptions) {
    await this.gestures?.dispose();
    this.gestures = new Gestures(player, player.getAPI(), options);
    await this.gestures.install();
    return this.gestures;
  }

  disconnectedCallback() {
    void this.gestures?.dispose();
    this.gestures = undefined;
  }
}

// Guarded so that re-evaluating this module (HMR, a duplicated bundle) does not
// throw, and so importing the package in a non-DOM environment stays safe.
if (typeof customElements !== 'undefined') {
  if (!customElements.get('ap-menu')) customElements.define('ap-menu', APMenuElement);
  if (!customElements.get('ap-gestures')) customElements.define('ap-gestures', APGesturesElement);
}
