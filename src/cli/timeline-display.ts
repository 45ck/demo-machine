import * as fs from "node:fs";
import * as path from "node:path";
import type { TimedNarrationSegment } from "../narration/types.js";
import type { ActionEvent } from "../playback/types.js";
import { createLogger } from "../utils/logger.js";
import {
  detectOverlaps,
  renderTimelineView,
  buildTimelineViewInput,
} from "../narration/timeline-view.js";

const log = createLogger("timeline-display");

interface TimelineDisplayParams {
  timedSegments: TimedNarrationSegment[];
  events: ActionEvent[];
  startTimestamp?: number;
  spec: unknown;
  totalDurationMs?: number;
  outputDir: string;
  showTimeline?: boolean;
}

/** Display timeline and save narration segments. Warns on overlaps. */
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

  // Warn on overlaps (output.mp4 is already rendered at this point)
  if (overlaps.length > 0) {
    const plural = overlaps.length !== 1 ? "s" : "";
    for (const o of overlaps) {
      log.warn(
        `Narration overlap: segment ${o.indexA} ↔ ${o.indexB} (${o.overlapMs.toFixed(0)}ms)`,
      );
    }
    log.warn(`${overlaps.length} narration overlap${plural} — consider adjusting pacing`);
  }
}
