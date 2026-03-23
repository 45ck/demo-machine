import * as fs from "node:fs";
import * as path from "node:path";
import type { TimedNarrationSegment } from "../narration/types.js";
import type { ActionEvent } from "../playback/types.js";
import {
  detectOverlaps,
  renderTimelineView,
  buildTimelineViewInput,
  NarrationOverlapError,
} from "../narration/timeline-view.js";

interface TimelineDisplayParams {
  timedSegments: TimedNarrationSegment[];
  events: ActionEvent[];
  startTimestamp?: number;
  spec: unknown;
  totalDurationMs?: number;
  outputDir: string;
  showTimeline?: boolean;
}

/** Display timeline and save narration segments. Throws on overlaps. */
export function displayTimelineAndSaveSegments(params: TimelineDisplayParams): void {
  const { timedSegments, events, spec, outputDir, showTimeline } = params;

  // Always save segments
  const segPath = path.join(outputDir, "narration-segments.json");
  fs.writeFileSync(segPath, JSON.stringify(timedSegments, null, 2));

  // Convert to segments with endMs for overlap detection
  const segments = timedSegments.map((s) => ({
    startMs: s.startMs,
    endMs: s.startMs + s.durationMs,
    text: s.text,
  }));

  // Always detect overlaps
  const overlaps = detectOverlaps(segments);

  // Render timeline if flag is set
  if (showTimeline) {
    const input = buildTimelineViewInput(events, segments, spec as Record<string, unknown>);
    const { output } = renderTimelineView(input);
    // eslint-disable-next-line no-console
    console.log(output);
  }

  // Hard error on overlaps
  if (overlaps.length > 0) {
    const plural = overlaps.length !== 1 ? "s" : "";
    throw new NarrationOverlapError(
      overlaps,
      `${overlaps.length} narration overlap${plural} detected`,
    );
  }
}
