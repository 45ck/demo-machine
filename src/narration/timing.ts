import { createLogger } from "../utils/logger.js";

const logger = createLogger("narration-timing");

/** Minimum silence between narration segments after de-overlap. */
export const GAP_MS = 200;
/**
 * Maximum tolerated silence between adjacent narration segments before we
 * pull the next segment forward to keep the audio track continuous. Above
 * this threshold viewers perceive the gap as "dead air" rather than a
 * breath between sentences. Keep it well under 1500ms so an ffmpeg silence
 * detector at d=1.5 cannot find a gap between narrations.
 */
export const MAX_INTER_SEGMENT_GAP_MS = 800;
const DEFAULT_ACTION_ANCHOR = 0.5;

export interface TimedSegment {
  path: string;
  startMs: number;
  durationMs: number;
}

export function adjustTiming(segmentFiles: TimedSegment[], leadInBufferMs = 0): void {
  // Save original action timestamps before shifting them.
  const actionTimestamps = segmentFiles.map((s) => s.startMs);

  // Pass 1: anchor each narration relative to its action so the action lands
  // mid-sentence. This gives the "lead-in" feel each segment is built around.
  for (let i = 0; i < segmentFiles.length; i++) {
    const seg = segmentFiles[i]!;
    const actionMs = actionTimestamps[i]!;
    seg.startMs = Math.max(
      0,
      actionMs - Math.round(seg.durationMs * DEFAULT_ACTION_ANCHOR) - leadInBufferMs,
    );
    logger.debug(
      `Segment ${i + 1}: action at ${actionMs}ms, narration ${seg.durationMs}ms buffer ${leadInBufferMs}ms → starts at ${seg.startMs}ms`,
    );
  }

  // Pass 2: chain segments so the audio track is continuous. Each segment
  // starts no earlier than the previous one finishes (+ GAP_MS) and no later
  // than the previous one finishes (+ MAX_INTER_SEGMENT_GAP_MS). The first
  // bound prevents overlap; the second eliminates long silence gaps that
  // appear when an action ran longer than its narration.
  for (let i = 1; i < segmentFiles.length; i++) {
    const prev = segmentFiles[i - 1]!;
    const prevEndMs = prev.startMs + prev.durationMs;
    const minStart = prevEndMs + GAP_MS;
    const maxStart = prevEndMs + MAX_INTER_SEGMENT_GAP_MS;
    const seg = segmentFiles[i]!;
    if (seg.startMs < minStart) {
      seg.startMs = minStart;
    } else if (seg.startMs > maxStart) {
      logger.debug(
        `Segment ${i + 1}: pulling forward from ${seg.startMs}ms to ${maxStart}ms (prev ended at ${prevEndMs}ms)`,
      );
      seg.startMs = maxStart;
    }
  }

  // Non-overlap is mandatory for the final audio mix. If actions happen too
  // close together, the renderer extends the video so later narration can
  // finish cleanly instead of stacking.
}

export function computeNarrationDuration(segments: TimedSegment[]): number {
  if (segments.length === 0) return 0;
  const last = segments[segments.length - 1]!;
  return last.startMs + last.durationMs;
}
