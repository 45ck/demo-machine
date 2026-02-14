import { createLogger } from "../utils/logger.js";

const logger = createLogger("narration-timing");

export const GAP_MS = 200;

export interface TimedSegment {
  path: string;
  startMs: number;
  durationMs: number;
}

export function adjustTiming(segmentFiles: TimedSegment[]): void {
  // Shift narration to lead into the action: audio finishes when the action happens
  for (let i = 0; i < segmentFiles.length; i++) {
    const seg = segmentFiles[i]!;
    const actionMs = seg.startMs;
    seg.startMs = Math.max(0, actionMs - seg.durationMs);
    logger.debug(
      `Segment ${i + 1}: action at ${actionMs}ms, narration ${seg.durationMs}ms → starts at ${seg.startMs}ms`,
    );
  }

  // Prevent overlap: if a segment starts before the previous one finishes, push it forward
  for (let i = 1; i < segmentFiles.length; i++) {
    const prev = segmentFiles[i - 1]!;
    const prevEndMs = prev.startMs + prev.durationMs + GAP_MS;
    if (segmentFiles[i]!.startMs < prevEndMs) {
      segmentFiles[i]!.startMs = prevEndMs;
    }
  }
}

export function computeNarrationDuration(segments: TimedSegment[]): number {
  if (segments.length === 0) return 0;
  const last = segments[segments.length - 1]!;
  return last.startMs + last.durationMs;
}
