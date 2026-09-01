/**
 * VideoFrameExtractor - Utility for capturing video frames without affecting playback
 * Uses a cloned video element to seek and capture frames independently
 */
export interface FrameExtractorOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: "image/jpeg" | "image/png";
  crossOrigin?: string;
}

export interface ExtractedFrame {
  dataUrl: string;
  timestamp: number;
  width: number;
  height: number;
}

export class VideoFrameExtractor {
  private sourceVideo: HTMLVideoElement;
  private clonedVideo: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private options: Required<FrameExtractorOptions>;
  private isInitialized = false;
  private seekQueue: Array<{
    timestamp: number;
    resolve: (frame: ExtractedFrame) => void;
    reject: (error: Error) => void;
  }> = [];
  private isProcessing = false;

  constructor(
    sourceVideo: HTMLVideoElement,
    options: FrameExtractorOptions = {},
  ) {
    this.sourceVideo = sourceVideo;
    this.options = {
      width: options.width || 320,
      height: options.height || 180,
      quality: options.quality || 0.8,
      format: options.format || "image/jpeg",
      crossOrigin: options.crossOrigin || "anonymous",
    };

    // Create canvas for frame extraction
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    this.ctx = this.canvas.getContext("2d")!;

    // Create cloned video element
    this.clonedVideo = document.createElement("video");
    this.clonedVideo.muted = true;
    this.clonedVideo.preload = "metadata";
    this.clonedVideo.crossOrigin = this.options.crossOrigin;

    // Hide the cloned video
    this.clonedVideo.style.position = "absolute";
    this.clonedVideo.style.top = "-9999px";
    this.clonedVideo.style.left = "-9999px";
    this.clonedVideo.style.visibility = "hidden";
  }

  /**
   * Initialize the frame extractor by cloning the source video
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Wait for source video to have metadata
      await this.waitForMetadata(this.sourceVideo);

      // Clone the source video properties
      this.clonedVideo.src = this.sourceVideo.src;
      this.clonedVideo.currentTime = this.sourceVideo.currentTime;

      // Wait for cloned video to load metadata
      await this.waitForMetadata(this.clonedVideo);

      // Add cloned video to DOM (required for some browsers)
      document.body.appendChild(this.clonedVideo);

      this.isInitialized = true;
    } catch (error: unknown) {
      throw new Error(
        `Failed to initialize frame extractor: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Extract a frame at the specified timestamp without affecting the source video
   */
  async extractFrame(timestamp: number): Promise<ExtractedFrame> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Validate timestamp
    const duration = this.clonedVideo.duration;
    if (duration && (timestamp < 0 || timestamp > duration)) {
      throw new Error(
        `Timestamp ${timestamp} is outside video duration [0, ${duration}]`,
      );
    }

    return new Promise((resolve, reject) => {
      this.seekQueue.push({ timestamp, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Extract multiple frames in sequence
   */
  async extractFrames(timestamps: number[]): Promise<ExtractedFrame[]> {
    const frames: ExtractedFrame[] = [];

    for (const timestamp of timestamps) {
      try {
        const frame = await this.extractFrame(timestamp);
        frames.push(frame);
      } catch (error) {
        console.warn(`Failed to extract frame at ${timestamp}s:`, error);
      }
    }

    return frames;
  }

  /**
   * Process the seek queue sequentially to avoid conflicts
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.seekQueue.length === 0) return;

    this.isProcessing = true;

    try {
      while (this.seekQueue.length > 0) {
        const task = this.seekQueue.shift()!;

        try {
          const frame = await this.performExtraction(task.timestamp);
          task.resolve(frame);
        } catch (error) {
          task.reject(error as Error);
        }
      }
    } finally {
      // Without the `finally` an unexpected throw would leave the queue
      // permanently wedged in the "processing" state.
      this.isProcessing = false;
    }
  }

  /**
   * Perform the actual frame extraction
   */
  private async performExtraction(timestamp: number): Promise<ExtractedFrame> {
    const wasPlaying = !this.clonedVideo.paused;
    const originalTime = this.clonedVideo.currentTime;

    try {
      // Pause if playing to ensure stable frame capture
      if (wasPlaying) {
        this.clonedVideo.pause();
      }

      // Seek to the desired timestamp
      await this.seekToTime(this.clonedVideo, timestamp);

      // Wait a bit for the frame to render
      await this.delay(50);

      // Clear canvas and draw the video frame
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(
        this.clonedVideo,
        0,
        0,
        this.canvas.width,
        this.canvas.height,
      );

      // Convert canvas to data URL
      const dataUrl = this.canvas.toDataURL(
        this.options.format,
        this.options.quality,
      );

      return {
        dataUrl,
        timestamp,
        width: this.canvas.width,
        height: this.canvas.height,
      };
    } finally {
      // Restore the original playback state
      if (wasPlaying) {
        try {
          await this.clonedVideo.play();
        } catch {
          // Ignore play errors (common in some browsers)
        }
      }

      // Restore original time if needed
      if (Math.abs(originalTime - timestamp) > 0.1) {
        this.clonedVideo.currentTime = originalTime;
      }
    }
  }

  /**
   * Seek video to specific time and wait for seek to complete
   */
  private async seekToTime(
    video: HTMLVideoElement,
    time: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (Math.abs(video.currentTime - time) < 0.1) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        video.removeEventListener("seeked", onSeeked);
        reject(new Error("Seek timeout"));
      }, 2000);

      const onSeeked = () => {
        clearTimeout(timeout);
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };

      video.addEventListener("seeked", onSeeked);
      video.currentTime = time;
    });
  }

  /**
   * Wait for video metadata to be loaded
   */
  private async waitForMetadata(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve, reject) => {
      if (video.readyState >= 1) {
        resolve();
        return;
      }

      // One controller removes both listeners on every exit path; the previous
      // version always left one of the two attached.
      const listeners = new AbortController();
      const timeout = setTimeout(() => {
        listeners.abort();
        reject(new Error("Metadata load timeout"));
      }, 5000);

      const onLoaded = () => {
        clearTimeout(timeout);
        listeners.abort();
        resolve();
      };

      const onError = () => {
        clearTimeout(timeout);
        listeners.abort();
        reject(new Error("Failed to load video metadata"));
      };

      video.addEventListener("loadedmetadata", onLoaded, { signal: listeners.signal });
      video.addEventListener("error", onError, { signal: listeners.signal });
    });
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Update extraction options
   */
  updateOptions(options: Partial<FrameExtractorOptions>): void {
    Object.assign(this.options, options);

    if (options.width !== undefined || options.height !== undefined) {
      this.canvas.width = this.options.width;
      this.canvas.height = this.options.height;
    }
  }

  /**
   * Get current options
   */
  getOptions(): Readonly<Required<FrameExtractorOptions>> {
    return { ...this.options };
  }

  /**
   * Check if the extractor is ready to use
   */
  isReady(): boolean {
    return this.isInitialized && this.clonedVideo.readyState >= 2;
  }

  /**
   * Get the cloned video duration
   */
  getDuration(): number {
    return this.clonedVideo.duration || 0;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    // Reject anything still queued; silently dropping the tasks left their
    // callers awaiting a promise that could never settle.
    const pending = this.seekQueue.splice(0, this.seekQueue.length);
    for (const task of pending) {
      task.reject(new Error("VideoFrameExtractor was disposed"));
    }
    this.isProcessing = false;

    if (this.clonedVideo.parentNode) {
      this.clonedVideo.parentNode.removeChild(this.clonedVideo);
    }

    this.clonedVideo.src = "";
    this.isInitialized = false;
  }
}

/**
 * Factory function to create a VideoFrameExtractor
 */
export function createFrameExtractor(
  video: HTMLVideoElement,
  options?: FrameExtractorOptions,
): VideoFrameExtractor {
  return new VideoFrameExtractor(video, options);
}
