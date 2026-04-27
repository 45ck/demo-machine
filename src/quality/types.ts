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

export interface RenderedVideoFrameSample {
  timestampMs: number;
  blank?: boolean | undefined;
  frozenWithPrevious?: boolean | undefined;
  lumaMean?: number | undefined;
  lumaStdDev?: number | undefined;
  differenceFromPrevious?: number | undefined;
  perceptualHash?: string | undefined;
}

export interface RenderedVideoSampleExtractionMetadata {
  requestedSampleCount: number;
  extractedSampleCount: number;
  status?: "success" | "partial" | "failed" | "skipped" | undefined;
  durationMs?: number | undefined;
  extractor?: string | undefined;
  errors?: string[] | undefined;
}

export interface RenderedVideoIntegrityThresholds {
  blankRatio?: number | undefined;
  frozenAdjacentRatio?: number | undefined;
  blankLumaMean?: number | undefined;
  blankLumaStdDev?: number | undefined;
  frozenDifference?: number | undefined;
  durationAbsoluteToleranceMs?: number | undefined;
  durationRelativeTolerance?: number | undefined;
}

/** Context provided to quality check functions. */
export interface QualityCheckContext {
  outputMp4Path: string;
  spec: {
    meta: { resolution: { width: number; height: number } };
    chapters?: Array<{ steps?: Array<{ action?: string }> }> | undefined;
  };
  manifestEntry?: ManifestEntry | undefined;
  fileSizeBytes?: number | undefined;
  probeResult?: VideoProbeResult | undefined;
  /** Action events from events.json, for narration ordering check. */
  events?: Array<{ action: string; timestamp: number; duration: number }> | undefined;
  /** Timed narration segments, for narration ordering check. */
  narrationSegments?:
    | Array<{ actionIndex: number; startMs: number; durationMs?: number; text: string }>
    | undefined;
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
  /** Previous run's file size in bytes, for file-size-trend check (#48). */
  previousFileSizeBytes?: number | undefined;
  /** Rendered-video frame sample metrics, when an extractor has provided them. */
  renderedVideoFrameSamples?: RenderedVideoFrameSample[] | undefined;
  /** Metadata from rendered-video frame sample extraction. */
  renderedVideoSampleExtraction?: RenderedVideoSampleExtractionMetadata | undefined;
  /** Optional thresholds for rendered-video integrity checks. */
  renderedVideoIntegrityThresholds?: RenderedVideoIntegrityThresholds | undefined;
}
