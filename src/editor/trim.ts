import type { ActionEvent } from "../capture/types.js";
import type { DemoSpec } from "../spec/types.js";

function totalStepCount(spec: DemoSpec): number {
  return spec.chapters.reduce((sum, chapter) => sum + chapter.steps.length, 0);
}

function normalizeFromStep(fromStep: number | undefined): number | undefined {
  if (fromStep === undefined) return undefined;
  if (!Number.isInteger(fromStep) || fromStep < 0) {
    throw new Error(`--from-step must be a non-negative integer. Received: ${String(fromStep)}`);
  }
  return fromStep;
}

export function resolveStartStepIndex(params: {
  spec: DemoSpec;
  fromChapter?: string | undefined;
  fromStep?: number | undefined;
}): number {
  const fromStep = normalizeFromStep(params.fromStep);

  if (!params.fromChapter) {
    return fromStep ?? 0;
  }

  const chapterIndex = params.spec.chapters.findIndex(
    (ch) => ch.title.toLowerCase() === params.fromChapter!.toLowerCase(),
  );
  if (chapterIndex < 0) {
    const available = params.spec.chapters.map((c) => c.title).join(", ");
    throw new Error(`Chapter "${params.fromChapter}" not found. Available: ${available}`);
  }

  const chapter = params.spec.chapters[chapterIndex]!;
  const stepInChapter = fromStep ?? 0;
  if (stepInChapter >= chapter.steps.length) {
    throw new Error(
      `--from-step ${String(stepInChapter)} is out of range for chapter "${chapter.title}" (${String(chapter.steps.length)} step(s))`,
    );
  }

  const priorSteps = params.spec.chapters
    .slice(0, chapterIndex)
    .reduce((sum, c) => sum + c.steps.length, 0);
  return priorSteps + stepInChapter;
}

export function trimSpecFromStepIndex(spec: DemoSpec, startStepIndex: number): DemoSpec {
  if (startStepIndex <= 0) return spec;
  const maxSteps = totalStepCount(spec);
  if (startStepIndex >= maxSteps) {
    throw new Error(
      `Trim start step ${String(startStepIndex)} exceeds available steps (${String(maxSteps)})`,
    );
  }

  let remaining = startStepIndex;
  const chapters: DemoSpec["chapters"] = [];

  for (const chapter of spec.chapters) {
    if (remaining >= chapter.steps.length) {
      remaining -= chapter.steps.length;
      continue;
    }

    chapters.push({
      ...chapter,
      steps: chapter.steps.slice(remaining),
    });
    remaining = 0;
  }

  if (chapters.length === 0) {
    throw new Error(`Trim produced no chapters from start step ${String(startStepIndex)}`);
  }

  return { ...spec, chapters };
}

export function applyTimelineTrim(params: {
  events: ActionEvent[];
  spec: DemoSpec;
  startTimestamp: number;
  fromChapter?: string | undefined;
  fromStep?: number | undefined;
  trimStartMs?: number | undefined;
}): {
  events: ActionEvent[];
  spec: DemoSpec;
  timelineStartTimestamp: number;
  videoTrimStartMs: number;
  startEventIndex: number;
} {
  const events = params.events;
  if (events.length === 0) {
    return {
      events,
      spec: params.spec,
      timelineStartTimestamp: params.startTimestamp,
      videoTrimStartMs: 0,
      startEventIndex: 0,
    };
  }

  const hasStepTrim = params.fromChapter !== undefined || params.fromStep !== undefined;
  const requestedStepIndex = hasStepTrim
    ? resolveStartStepIndex({
        spec: params.spec,
        fromChapter: params.fromChapter,
        fromStep: params.fromStep,
      })
    : 0;

  const specStepCount = totalStepCount(params.spec);
  if (requestedStepIndex >= specStepCount) {
    throw new Error(
      `Requested trim step index ${String(requestedStepIndex)} exceeds spec step count (${String(specStepCount)})`,
    );
  }

  if (hasStepTrim && requestedStepIndex >= events.length) {
    throw new Error(
      `Requested trim step index ${String(requestedStepIndex)} exceeds captured event count (${String(events.length)})`,
    );
  }

  const baseTrimMs = hasStepTrim
    ? Math.max(0, events[requestedStepIndex]!.timestamp - params.startTimestamp)
    : 0;
  const extraTrimMs = Math.max(0, params.trimStartMs ?? 0);
  const trimStartMs = baseTrimMs + extraTrimMs;
  const trimStartTimestamp = params.startTimestamp + trimStartMs;

  const startEventIndex = events.findIndex((ev) => ev.timestamp >= trimStartTimestamp);
  if (startEventIndex < 0) {
    throw new Error(
      `Trim start (${String(trimStartMs)}ms) removes all events; capture has ${String(events.length)} event(s)`,
    );
  }

  return {
    events: events.slice(startEventIndex),
    spec: trimSpecFromStepIndex(params.spec, requestedStepIndex),
    timelineStartTimestamp: trimStartTimestamp,
    videoTrimStartMs: trimStartMs,
    startEventIndex,
  };
}
