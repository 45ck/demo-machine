import type { ActionEvent } from "../playback/types.js";
import type { DemoSpec } from "../spec/types.js";
import type { NarrationSegment } from "../narration/types.js";

const MIN_READING_MS = 1_800;
const MAX_READING_MS = 8_000;
const MS_PER_WORD = 300;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readingDurationMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return clamp(words * MS_PER_WORD, MIN_READING_MS, MAX_READING_MS);
}

interface CaptionCandidate {
  text: string;
  startMs: number;
  eventEndMs: number;
}

/**
 * Build a deterministic caption track from reviewed step narration and the
 * captured action timeline. This path deliberately does not synthesize audio.
 */
export function deriveReviewedSpecCaptions(params: {
  spec: DemoSpec;
  events: ActionEvent[];
  startTimestamp: number;
  durationMs: number;
}): NarrationSegment[] {
  const durationMs = Math.max(0, Math.round(params.durationMs));
  if (durationMs < 1) return [];

  const candidates: CaptionCandidate[] = [];
  let eventIndex = 0;
  for (const chapter of params.spec.chapters) {
    for (const step of chapter.steps) {
      const event = params.events[eventIndex];
      const text = step.narration?.replace(/\s+/g, " ").trim();
      if (event && text) {
        const rawStartMs = Math.round(event.timestamp - params.startTimestamp);
        if (rawStartMs < durationMs) {
          const startMs = clamp(rawStartMs, 0, durationMs - 1);
          const eventEndMs = clamp(
            Math.round(event.timestamp + event.duration - params.startTimestamp),
            startMs + 1,
            durationMs,
          );
          candidates.push({ text, startMs, eventEndMs });
        }
      }
      eventIndex++;
    }
  }

  return candidates.map((candidate, index) => {
    const nextStartMs = candidates[index + 1]?.startMs;
    const readableEndMs = Math.max(
      candidate.eventEndMs,
      candidate.startMs + readingDurationMs(candidate.text),
    );
    const endMs = Math.max(
      candidate.startMs + 1,
      Math.min(durationMs, nextStartMs ?? durationMs, readableEndMs),
    );
    return { text: candidate.text, startMs: candidate.startMs, endMs };
  });
}
