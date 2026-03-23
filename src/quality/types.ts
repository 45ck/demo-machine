/** Result of probing a video file with ffprobe. */
export interface VideoProbeResult {
  width: number;
  height: number;
  /** Sample aspect ratio, e.g. "1:1". */
  sar: string;
  /** Video codec name, e.g. "h264". */
  videoCodec: string;
  /** Pixel format, e.g. "yuv420p". */
  pixFmt: string;
  /** Container format string from ffprobe, e.g. "mov,mp4,m4a,3gp,3g2,mj2". */
  containerFormat: string;
  /** Video stream duration in seconds. */
  videoDurationSec: number;
  /** Audio stream duration in seconds, or null if no audio stream. */
  audioDurationSec: number | null;
}

/** Manifest entry for a demo suite (subset of fields relevant to quality checks). */
export interface ManifestEntry {
  slug: string;
  maxOutputBytes?: number;
}

/** Context provided to quality check functions. */
export interface QualityCheckContext {
  outputMp4Path: string;
  spec: { meta: { resolution: { width: number; height: number } } };
  manifestEntry?: ManifestEntry | undefined;
  fileSizeBytes?: number | undefined;
  probeResult?: VideoProbeResult | undefined;
  /** Action events from events.json, for narration ordering check. */
  events?: Array<{ action: string; timestamp: number; duration: number }> | undefined;
  /** Timed narration segments, for narration ordering check. */
  narrationSegments?: Array<{ actionIndex: number; startMs: number; text: string }> | undefined;
  /** Frame presentation timestamps in seconds, for frame rate check. */
  framePtsSec?: number[] | undefined;
  /** Whether the spec includes an intro segment. */
  hasIntro?: boolean | undefined;
  /** Whether the spec includes an outro segment. */
  hasOutro?: boolean | undefined;
  /** Expected intro duration in ms (default 2000). */
  introDurationMs?: number | undefined;
  /** Expected outro duration in ms (default 2000). */
  outroDurationMs?: number | undefined;
  /** Historical timing data keyed by action type, for duration anomaly check. */
  timingHistory?: Record<string, number[]> | undefined;
  /** Step screenshots as PNG buffers, keyed by step index. */
  stepScreenshots?: Map<number, Buffer> | undefined;
  /** Screenshot pairs for assert steps: [beforeAssert, afterAssert]. */
  assertScreenshotPairs?: Array<{ stepIndex: number; before: Buffer; after: Buffer }> | undefined;
  /** Cursor positions at click moments. */
  cursorPositions?:
    | Array<{
        stepIndex: number;
        cursorX: number;
        cursorY: number;
        targetCenterX: number;
        targetCenterY: number;
      }>
    | undefined;
  /** Chapter title frame screenshots as PNG buffers, keyed by chapter index. */
  chapterTitleScreenshots?: Map<number, Buffer> | undefined;
}
