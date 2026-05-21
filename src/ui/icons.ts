export const ICONS = {
  play: '<path fill="currentColor" d="M8 5v14l11-7z"/>',
  pause: '<path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>',
  volumeHigh:
    '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>',
  volumeLow:
    '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>',
  volumeMute:
    '<path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>',
  settings:
    '<path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .43-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>',
  fullscreen:
    '<path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>',
  exitFullscreen:
    '<path fill="currentColor" d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>',
  forward: '<path fill="currentColor" d="M4 5v14l8-7-8-7Zm9 0v14l8-7-8-7Z"/>',
  back: '<path fill="currentColor" d="M20 5v14l-8-7 8-7Zm-9 0v14L3 12l8-7Z"/>',
  skipNext:
    '<path fill="currentColor" d="M5 18l10-6-10-6v12zm14-12h-3v12h3V6z"/>',
  skipPrev: '<path fill="currentColor" d="M19 6l-10 6 10 6V6zM5 6h3v12H5V6z"/>',
  adelant:
    '<path fill="currentColor" d="M5.58 16.84l5.77-4.07c.56-.4.56-1.15 0-1.54L5.58 7.16c-.66-.46-1.58.01-1.58.82v8.04c0 .81.92 1.28 1.58.82zm9 0l5.77-4.07c.56-.4.56-1.15 0-1.54l-5.77-4.07c-.66-.46-1.58.01-1.58.82v8.04c0 .81.92 1.28 1.58.82z"/>',
  retrocess:
    '<path fill="currentColor" d="M18.42 7.16l-5.77 4.07c-.56.4-.56 1.15 0 1.54l5.77 4.07c.66.46 1.58-.01 1.58-.82V8.02c0-.81-.92-1.28-1.58-.82zm-9 0L3.65 11.23c-.56.4-.56 1.15 0 1.54l5.77 4.07c.66.46 1.58-.01 1.58-.82V8.02c0-.81-.92-1.28-1.58-.82z"/>',
  boost: '<path fill="currentColor" d="M12 2l4 8H8l4-8Zm0 20l-4-8h8l-4 8Z"/>',
  menuArrow:
    '<path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>',
  menuBack:
    '<path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>',
  check:
    '<path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
  loading:
    '<path fill="currentColor" d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z"/>',
};

export interface CreateSVGOptions {
  size?: number;
  color?: string;
  className?: string;
}

export function createSVG(
  path: string | HTMLElement,
  options: number | CreateSVGOptions = 24,
): HTMLElement | SVGSVGElement {
  if (path instanceof HTMLElement) return path;

  const opts: CreateSVGOptions =
    typeof options === "number" ? { size: options } : options;
  const {
    size = 24,
    color = "var(--ye-icon-color, currentColor)",
    className,
  } = opts;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size.toString());
  svg.setAttribute("height", size.toString());

  if (className) svg.classList.add(className);

  // Set attributes for better cross-browser compatibility
  svg.setAttribute("fill", color);
  svg.style.fill = color;
  svg.style.display = "block";
  svg.style.pointerEvents = "none"; // Ensure icons don't capture clicks

  // Use insertAdjacentHTML for better SVG inner content parsing
  svg.insertAdjacentHTML(
    "afterbegin",
    typeof path === "string" ? path : (path as HTMLElement).outerHTML,
  );

  return svg;
}
