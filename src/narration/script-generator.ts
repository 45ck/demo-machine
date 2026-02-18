import type { Chapter } from "../spec/types.js";
import type { ActionEvent } from "../capture/types.js";
import type { NarrationSegment } from "./types.js";

const DEFAULT_STEP_DURATION_MS = 3000;

export function generateScript(
  chapters: Chapter[],
  events: ActionEvent[],
  t0Override?: number,
): NarrationSegment[] {
  const segments: NarrationSegment[] = [];
  let eventIndex = 0;
  const t0 = t0Override ?? events[0]?.timestamp ?? 0;

  for (const chapter of chapters) {
    for (const step of chapter.steps) {
      const event: ActionEvent | undefined = events[eventIndex];

      if (step.narration) {
        const startMs = event ? event.timestamp - t0 : eventIndex * DEFAULT_STEP_DURATION_MS;
        const endMs = event
          ? event.timestamp + event.duration - t0
          : startMs + DEFAULT_STEP_DURATION_MS;

        segments.push({
          text: step.narration,
          startMs,
          endMs,
        });
      }

      eventIndex++;
    }
  }

  return segments;
}
