/**
 * Returns true when `url` points at an HLS manifest.
 * Query strings and fragments are stripped before the extension check so that
 * signed URLs (`.../master.m3u8?token=...`) are still detected.
 */
export function isHlsUrl(url: string): boolean {
  if (!url) return false;
  const path = url.toLowerCase().split("#")[0].split("?")[0];
  return path.endsWith(".m3u8");
}
