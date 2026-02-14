import type { ActionEvent } from "../capture/types.js";
import type { DemoSpec } from "../spec/types.js";
import type { Segment, Timeline } from "./types.js";

const INTRO_DURATION_MS = 2000;
const CHAPTER_TITLE_DURATION_MS = 1500;
const OUTRO_DURATION_MS = 2000;
const DEAD_TIME_THRESHOLD_MS = 3000;
const DEAD_TIME_SPEED_FACTOR = 3;

export function buildTimeline(events: ActionEvent[], spec: DemoSpec): Timeline {
  const segments: Segment[] = [];

  if (events.length === 0) {
    return { segments, totalDurationMs: 0, resolution: spec.meta.resolution };
  }

  const firstEvent = events[0];
  if (!firstEvent) {
    return { segments, totalDurationMs: 0, resolution: spec.meta.resolution };
  }

  const t0 = firstEvent.timestamp;
  const lastEvent = events[events.length - 1]!;
  const videoDurationMs = lastEvent.timestamp + lastEvent.duration - t0;

  addIntroOverlay(segments, spec);
  addChapterAndContentSegments(segments, events, spec, t0);
  addOutroOverlay(segments, videoDurationMs);

  return {
    segments,
    totalDurationMs: videoDurationMs,
    resolution: spec.meta.resolution,
  };
}

function addIntroOverlay(segments: Segment[], spec: DemoSpec): void {
  segments.push({
    startMs: 0,
    endMs: INTRO_DURATION_MS,
    type: "intro",
    label: spec.meta.title,
  });
}

function addChapterAndContentSegments(
  segments: Segment[],
  events: ActionEvent[],
  spec: DemoSpec,
  t0: number,
): void {
  let eventIndex = 0;

  for (const chapter of spec.chapters) {
    const chapterFirstEvent = events[eventIndex];
    if (!chapterFirstEvent) break;

    const chapterStartMs = chapterFirstEvent.timestamp - t0;
    segments.push({
      startMs: chapterStartMs,
      endMs: chapterStartMs + CHAPTER_TITLE_DURATION_MS,
      type: "chapter",
      label: chapter.title,
    });

    const chapterStepCount = chapter.steps.length;
    for (let s = 0; s < chapterStepCount; s++) {
      const event = events[eventIndex];
      if (!event) break;

      addContentSegment({ segments, events, event, eventIndex, t0 });
      addCalloutIfNeeded(segments, event, t0);
      eventIndex++;
    }
  }
}

interface ContentSegmentParams {
  segments: Segment[];
  events: ActionEvent[];
  event: ActionEvent;
  eventIndex: number;
  t0: number;
}

function addContentSegment(params: ContentSegmentParams): void {
  const { segments, events, event: currentEvent, eventIndex, t0 } = params;
  const startMs = currentEvent.timestamp - t0;
  const endMs = startMs + currentEvent.duration;
  const segment: Segment = {
    startMs,
    endMs,
    type: "content",
  };

  const prevEvent = events[eventIndex - 1];
  if (prevEvent) {
    const gap = currentEvent.timestamp - (prevEvent.timestamp + prevEvent.duration);
    if (gap > DEAD_TIME_THRESHOLD_MS) {
      segment.speedFactor = DEAD_TIME_SPEED_FACTOR;
    }
  }

  segments.push(segment);
}

function addCalloutIfNeeded(segments: Segment[], event: ActionEvent, t0: number): void {
  if (event.action === "click" && event.boundingBox) {
    const bb = event.boundingBox;
    const timeMs = event.timestamp - t0;
    segments.push({
      startMs: timeMs,
      endMs: timeMs + 1500,
      type: "callout",
      zoom: {
        x: bb.x,
        y: bb.y,
        width: bb.width,
        height: bb.height,
        padding: 40,
      },
    });
  }
}

function addOutroOverlay(segments: Segment[], videoDurationMs: number): void {
  const outroStart = Math.max(0, videoDurationMs - OUTRO_DURATION_MS);
  segments.push({
    startMs: outroStart,
    endMs: videoDurationMs,
    type: "outro",
    label: "Thanks for watching",
  });
}
