import type {
    IPlayer,
    PluginAPI,
    PlayerPluginInstance,
    PluginManifest,
    ThumbnailPlugin,
    ThumbnailData,
    ThumbnailSprite,
} from "../../types";

export interface VttThumbnailOptions {
    vttUrl?: string;
    sprites?: ThumbnailSprite[];
    cors?: string;
}

export function createVttThumbnailPlugin(options: VttThumbnailOptions = {}): PluginManifest {
    return {
        name: "vtt-thumbnail-plugin",
        version: "1.0.0",
        description: "Hover preview thumbnails using VTT sprite sheets (YouTube-style)",
        factory: (player: IPlayer, api: PluginAPI) => {
            return new VttThumbnailPlugin(player, api, options);
        },
    };
}

class VttThumbnailPlugin implements PlayerPluginInstance, ThumbnailPlugin {
    private sprites: ThumbnailSprite[] = [];
    private vttEntries: VttEntry[] = [];
    private cors: string;
    private isLoaded = false;
    private vttBaseUrl = "";

    constructor(
        private player: IPlayer,
        private api: PluginAPI,
        private options: VttThumbnailOptions,
    ) {
        this.cors = options.cors || "anonymous";
    }

    async install() {
        if (this.options.vttUrl) {
            await this.loadVttFile(this.options.vttUrl);
        } else if (this.options.sprites) {
            this.sprites = Array.isArray(this.options.sprites) ? this.options.sprites : [this.options.sprites];
            this.isLoaded = true;
        }

        if (this.isLoaded) {
            this.api.registerThumbnailProvider(this);
        }
    }

    async loadVttFile(url: string): Promise<void> {
        try {
            this.vttBaseUrl = url.substring(0, url.lastIndexOf("/") + 1);
            const response = await fetch(url);
            const text = await response.text();
            this.vttEntries = parseVtt(text, this.vttBaseUrl);

            for (const entry of this.vttEntries) {
                if (entry.imageUrl && !this.sprites.some(s => s.url === entry.imageUrl)) {
                    this.sprites.push({
                        url: entry.imageUrl,
                        width: entry.width || 160,
                        height: entry.height || 90,
                        tileWidth: entry.width || 160,
                        tileHeight: entry.height || 90,
                        interval: 10,
                    });
                }
            }

            this.isLoaded = this.vttEntries.length > 0;
        } catch (e) {
            console.warn("VTT Thumbnail: Failed to load VTT file:", e);
        }
    }

    async loadThumbnails(sprite: ThumbnailSprite | ThumbnailSprite[]): Promise<void> {
        this.sprites = Array.isArray(sprite) ? sprite : [sprite];
        this.isLoaded = true;
    }

    getThumbnailAtTime(time: number): ThumbnailData | null {
        if (!this.isLoaded || this.sprites.length === 0) return null;

        if (this.vttEntries.length > 0) {
            const entry = this.vttEntries.find(e => time >= e.start && time < e.end);
            if (entry) {
                return {
                    time,
                    x: entry.x,
                    y: entry.y,
                    width: entry.width || 160,
                    height: entry.height || 90,
                    url: entry.imageUrl,
                };
            }
            return null;
        }

        for (const sprite of this.sprites) {
            const index = Math.floor(time / sprite.interval);
            const totalTilesX = Math.floor(sprite.width / sprite.tileWidth);
            const totalTiles = totalTilesX * Math.floor(sprite.height / sprite.tileHeight);

            if (index < totalTiles) {
                const col = index % totalTilesX;
                const row = Math.floor(index / totalTilesX);
                return {
                    time,
                    x: col * sprite.tileWidth,
                    y: row * sprite.tileHeight,
                    width: sprite.tileWidth,
                    height: sprite.tileHeight,
                    url: sprite.url,
                };
            }
        }

        return null;
    }

    getPreviewsURL(): string | null {
        if (this.sprites.length === 0) return null;
        return this.sprites[0].url;
    }

    dispose() {
        this.sprites = [];
        this.vttEntries = [];
        this.isLoaded = false;
    }
}

interface VttEntry {
    start: number;
    end: number;
    imageUrl: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
}

function parseVtt(text: string, baseUrl: string): VttEntry[] {
    const entries: VttEntry[] = [];
    const lines = text.split(/\r?\n/);
    let i = 0;

    while (i < lines.length) {
        const line = lines[i].trim();

        if (line === "WEBVTT" || line === "" || !line.includes("-->")) {
            i++;
            continue;
        }

        const timestampMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
        if (!timestampMatch) {
            i++;
            continue;
        }

        const start = parseTimestamp(timestampMatch[1]);
        const end = parseTimestamp(timestampMatch[2]);
        i++;

        const contentLine = lines[i]?.trim() || "";
        i++;

        if (contentLine) {
            const parsed = parseContentLine(contentLine, baseUrl);
            if (parsed) {
                entries.push({ start, end, ...parsed });
            }
        }
    }

    return entries;
}

function parseTimestamp(ts: string): number {
    const parts = ts.split(":");
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseFloat(parts[2]);
    return h * 3600 + m * 60 + s;
}

function parseContentLine(line: string, baseUrl: string): { imageUrl: string; x: number; y: number; width?: number; height?: number } | null {
    const xywhMatch = line.match(/^(.+?)#xywh=(\d+),(\d+),(\d+)(?:,(\d+))?$/);
    if (xywhMatch) {
        const rawUrl = xywhMatch[1].trim();
        const imageUrl = resolveUrl(rawUrl, baseUrl);
        return {
            imageUrl,
            x: parseInt(xywhMatch[2], 10),
            y: parseInt(xywhMatch[3], 10),
            width: parseInt(xywhMatch[4], 10),
            height: xywhMatch[5] ? parseInt(xywhMatch[5], 10) : parseInt(xywhMatch[4], 10),
        };
    }

    const simpleMatch = line.match(/^(.+?)\s*$/);
    if (simpleMatch) {
        const rawUrl = simpleMatch[1].trim();
        const imageUrl = resolveUrl(rawUrl, baseUrl);
        return {
            imageUrl,
            x: 0,
            y: 0,
        };
    }

    return null;
}

function resolveUrl(url: string, base: string): string {
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("//")) {
        return url;
    }
    if (url.startsWith("/")) {
        const urlObj = new URL(base);
        return `${urlObj.protocol}//${urlObj.host}${url}`;
    }
    return base + url;
}
