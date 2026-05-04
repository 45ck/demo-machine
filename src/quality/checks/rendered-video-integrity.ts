/* eslint-disable max-lines */
import { postRenderPass, postRenderFail, postRenderWarn } from "../../validation/types.js";
import type { CheckResult } from "../../validation/types.js";
import type {
  QualityCheckContext,
  RenderedVideoFrameSample,
  RenderedVideoIntegrityThresholds,
  RenderedVideoSampleExtractionMetadata,
} from "../types.js";

const BLANK_CHECK_NAME = "rendered-video:blank-frame-ratio";
const FROZEN_CHECK_NAME = "rendered-video:frozen-adjacent-ratio";
const DURATION_CHECK_NAME = "rendered-video:duration-event-mismatch";
const EXTRACTION_CHECK_NAME = "rendered-video:sample-extraction";

const DEFAULT_BLANK_RATIO_THRESHOLD = 0.2;
const DEFAULT_FROZEN_RATIO_THRESHOLD = 0.95;
const DEFAULT_BLANK_LUMA_MEAN_THRESHOLD = 4;
const DEFAULT_BLANK_LUMA_STDDEV_THRESHOLD = 2;
const DEFAULT_FROZEN_DIFFERENCE_THRESHOLD = 0.002;
const DEFAULT_DURATION_ABSOLUTE_TOLERANCE_MS = 2500;
const DEFAULT_DURATION_RELATIVE_TOLERANCE = 0.2;
const FROZEN_RATIO_SAMPLE_MARGIN = 0.02;
const MIN_ADJACENT_PAIRS_FOR_MARGIN = 20;

export type {
  RenderedVideoFrameSample,
  RenderedVideoIntegrityThresholds,
  RenderedVideoSampleExtractionMetadata,
};

export interface RenderedVideoIntegrityEvent {
  action: string;
  timestamp: number;
  duration: number;
}

export interface RenderedVideoIntegrityNarrationSegment {
  actionIndex: number;
  startMs: number;
  durationMs?: number | undefined;
  text: string;
}

export interface RenderedVideoIntegrityContext {
  videoDurationMs?: number | undefined;
  events?: RenderedVideoIntegrityEvent[] | undefined;
  narrationSegments?: RenderedVideoIntegrityNarrationSegment[] | undefined;
  frameSamples?: RenderedVideoFrameSample[] | undefined;
  sampleExtraction?: RenderedVideoSampleExtractionMetadata | undefined;
  thresholds?: RenderedVideoIntegrityThresholds | undefined;
}

export function renderedVideoIntegrityContextFromQualityGate(
  ctx: QualityCheckContext,
): RenderedVideoIntegrityContext {
  return {
    videoDurationMs:
      ctx.probeResult?.videoDurationSec !== undefined
        ? ctx.probeResult.videoDurationSec * 1000
        : undefined,
    events: ctx.events,
    narrationSegments: ctx.narrationSegments,
    frameSamples: ctx.renderedVideoFrameSamples,
    sampleExtraction: ctx.renderedVideoSampleExtraction,
    thresholds: ctx.renderedVideoIntegrityThresholds,
  };
}

interface RenderedVideoIntegritySignals {
  sampleCount: number;
  blankFrameCount: number;
  blankFrameRatio: number;
  adjacentPairCount: number;
  frozenAdjacentPairCount: number;
  frozenAdjacentSampleRatio: number;
  expectedDurationMs: number | null;
  actualDurationMs: number | null;
  durationDeltaMs: number | null;
  extractionRequestedSampleCount: number | null;
  extractionExtractedSampleCount: number | null;
  extractionErrorCount: number;
}

function thresholdValue(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function isBlankFrame(
  sample: RenderedVideoFrameSample,
  thresholds: RenderedVideoIntegrityThresholds | undefined,
): boolean {
  if (sample.blank !== undefined) return sample.blank;

  const meanThreshold = thresholdValue(
    thresholds?.blankLumaMean,
    DEFAULT_BLANK_LUMA_MEAN_THRESHOLD,
  );
  const stdDevThreshold = thresholdValue(
    thresholds?.blankLumaStdDev,
    DEFAULT_BLANK_LUMA_STDDEV_THRESHOLD,
  );

  return (
    sample.lumaMean !== undefined &&
    sample.lumaStdDev !== undefined &&
    sample.lumaMean <= meanThreshold &&
    sample.lumaStdDev <= stdDevThreshold
  );
}

function isFrozenAdjacentPair(
  previous: RenderedVideoFrameSample,
  current: RenderedVideoFrameSample,
  thresholds: RenderedVideoIntegrityThresholds | undefined,
): boolean {
  if (current.frozenWithPrevious !== undefined) return current.frozenWithPrevious;
  if (
    previous.perceptualHash !== undefined &&
    current.perceptualHash !== undefined &&
    previous.perceptualHash === current.perceptualHash
  ) {
    return true;
  }

  const differenceThreshold = thresholdValue(
    thresholds?.frozenDifference,
    DEFAULT_FROZEN_DIFFERENCE_THRESHOLD,
  );
  return (
    current.differenceFromPrevious !== undefined &&
    current.differenceFromPrevious <= differenceThreshold
  );
}

export function computeExpectedEventDurationMs(
  events: RenderedVideoIntegrityEvent[] | undefined,
): number | null {
  if (!events || events.length === 0) return null;

  const spans = events
    .filter((event) => Number.isFinite(event.timestamp) && Number.isFinite(event.duration))
    .map((event) => ({
      start: event.timestamp,
      end: event.timestamp + event.duration,
    }))
    .filter((span) => Number.isFinite(span.end));

  const starts = spans.map((span) => span.start);
  const ends = spans.map((span) => span.end);

  if (starts.length === 0 || ends.length === 0) return null;

  return Math.max(0, Math.max(...ends) - Math.min(...starts));
}

export function computeExpectedNarrationDurationMs(
  segments: RenderedVideoIntegrityNarrationSegment[] | undefined,
): number | null {
  if (!segments || segments.length === 0) return null;

  const spans = segments
    .filter(
      (segment) =>
        Number.isFinite(segment.startMs) &&
        segment.durationMs !== undefined &&
        Number.isFinite(segment.durationMs),
    )
    .map((segment) => ({
      start: segment.startMs,
      end: segment.startMs + segment.durationMs!,
    }))
    .filter((span) => Number.isFinite(span.end));

  const starts = spans.map((span) => span.start);
  const ends = spans.map((span) => span.end);

  if (starts.length === 0 || ends.length === 0) return null;

  return Math.max(0, Math.max(...ends) - Math.min(...starts));
}

function computeExpectedDurationMs(ctx: RenderedVideoIntegrityContext): number | null {
  const candidates = [
    computeExpectedEventDurationMs(ctx.events),
    computeExpectedNarrationDurationMs(ctx.narrationSegments),
  ].filter((duration): duration is number => duration !== null);

  return candidates.length === 0 ? null : Math.max(...candidates);
}

function validSamples(samples: RenderedVideoFrameSample[] | undefined): RenderedVideoFrameSample[] {
  return samples?.filter((sample) => Number.isFinite(sample.timestampMs)) ?? [];
}

function countBlankFrames(
  samples: RenderedVideoFrameSample[],
  thresholds: RenderedVideoIntegrityThresholds | undefined,
): number {
  return samples.filter((sample) => isBlankFrame(sample, thresholds)).length;
}

function countFrozenAdjacentPairs(
  samples: RenderedVideoFrameSample[],
  thresholds: RenderedVideoIntegrityThresholds | undefined,
): number {
  let frozenAdjacentPairCount = 0;
  for (let i = 1; i < samples.length; i++) {
    if (isFrozenAdjacentPair(samples[i - 1]!, samples[i]!, thresholds)) {
      frozenAdjacentPairCount++;
    }
  }
  return frozenAdjacentPairCount;
}

function actualDurationMs(videoDurationMs: number | undefined): number | null {
  return videoDurationMs !== undefined && Number.isFinite(videoDurationMs) ? videoDurationMs : null;
}

function durationDeltaMs(actualMs: number | null, expectedMs: number | null): number | null {
  return expectedMs !== null && actualMs !== null ? Math.abs(actualMs - expectedMs) : null;
}

export function analyzeRenderedVideoIntegrity(
  ctx: RenderedVideoIntegrityContext,
): RenderedVideoIntegritySignals {
  const samples = validSamples(ctx.frameSamples);
  const blankFrameCount = countBlankFrames(samples, ctx.thresholds);
  const frozenAdjacentPairCount = countFrozenAdjacentPairs(samples, ctx.thresholds);
  const adjacentPairCount = Math.max(0, samples.length - 1);
  const expectedDurationMs = computeExpectedDurationMs(ctx);
  const actualMs = actualDurationMs(ctx.videoDurationMs);
  const deltaMs = durationDeltaMs(actualMs, expectedDurationMs);

  return {
    sampleCount: samples.length,
    blankFrameCount,
    blankFrameRatio: samples.length === 0 ? 0 : blankFrameCount / samples.length,
    adjacentPairCount,
    frozenAdjacentPairCount,
    frozenAdjacentSampleRatio:
      adjacentPairCount === 0 ? 0 : frozenAdjacentPairCount / adjacentPairCount,
    expectedDurationMs,
    actualDurationMs: actualMs,
    durationDeltaMs: deltaMs,
    extractionRequestedSampleCount: ctx.sampleExtraction?.requestedSampleCount ?? null,
    extractionExtractedSampleCount: ctx.sampleExtraction?.extractedSampleCount ?? null,
    extractionErrorCount: ctx.sampleExtraction?.errors?.length ?? 0,
  };
}

export function checkBlankFrameRatio(ctx: RenderedVideoIntegrityContext): CheckResult[] {
  const signals = analyzeRenderedVideoIntegrity(ctx);
  if (signals.sampleCount === 0) {
    return [{ ...postRenderPass(BLANK_CHECK_NAME), message: "No frame samples (skipped)" }];
  }

  const threshold = thresholdValue(ctx.thresholds?.blankRatio, DEFAULT_BLANK_RATIO_THRESHOLD);
  if (signals.blankFrameRatio <= threshold) {
    return [postRenderPass(BLANK_CHECK_NAME)];
  }

  return [
    postRenderFail(
      BLANK_CHECK_NAME,
      `Blank frame ratio ${(signals.blankFrameRatio * 100).toFixed(1)}% exceeds ${(threshold * 100).toFixed(1)}% (${signals.blankFrameCount}/${signals.sampleCount} samples)`,
      "Inspect the rendered video for black screens or missing captured frames",
    ),
  ];
}

export function checkFrozenAdjacentSampleRatio(ctx: RenderedVideoIntegrityContext): CheckResult[] {
  const signals = analyzeRenderedVideoIntegrity(ctx);
  if (signals.adjacentPairCount === 0) {
    return [
      { ...postRenderPass(FROZEN_CHECK_NAME), message: "Insufficient frame samples (skipped)" },
    ];
  }

  const threshold = thresholdValue(
    ctx.thresholds?.frozenAdjacentRatio,
    DEFAULT_FROZEN_RATIO_THRESHOLD,
  );
  if (signals.frozenAdjacentSampleRatio <= threshold) {
    return [postRenderPass(FROZEN_CHECK_NAME)];
  }

  const overage = signals.frozenAdjacentSampleRatio - threshold;
  if (
    signals.adjacentPairCount >= MIN_ADJACENT_PAIRS_FOR_MARGIN &&
    overage <= FROZEN_RATIO_SAMPLE_MARGIN
  ) {
    return [
      postRenderWarn(
        FROZEN_CHECK_NAME,
        `Frozen adjacent sample ratio ${(signals.frozenAdjacentSampleRatio * 100).toFixed(1)}% is slightly above ${(threshold * 100).toFixed(1)}% (${signals.frozenAdjacentPairCount}/${signals.adjacentPairCount} adjacent pairs)`,
      ),
    ];
  }

  return [
    postRenderFail(
      FROZEN_CHECK_NAME,
      `Frozen adjacent sample ratio ${(signals.frozenAdjacentSampleRatio * 100).toFixed(1)}% exceeds ${(threshold * 100).toFixed(1)}% (${signals.frozenAdjacentPairCount}/${signals.adjacentPairCount} adjacent pairs)`,
      "Check for renderer stalls, duplicated frames, or missing screen updates",
    ),
  ];
}

export function checkDurationEventMismatch(ctx: RenderedVideoIntegrityContext): CheckResult[] {
  const signals = analyzeRenderedVideoIntegrity(ctx);
  if (signals.actualDurationMs === null) {
    return [{ ...postRenderPass(DURATION_CHECK_NAME), message: "No video duration (skipped)" }];
  }
  if (signals.expectedDurationMs === null) {
    return [{ ...postRenderPass(DURATION_CHECK_NAME), message: "No events (skipped)" }];
  }

  const absoluteToleranceMs = thresholdValue(
    ctx.thresholds?.durationAbsoluteToleranceMs,
    DEFAULT_DURATION_ABSOLUTE_TOLERANCE_MS,
  );
  const relativeTolerance = thresholdValue(
    ctx.thresholds?.durationRelativeTolerance,
    DEFAULT_DURATION_RELATIVE_TOLERANCE,
  );
  const relativeDelta =
    signals.expectedDurationMs === 0
      ? signals.durationDeltaMs!
      : signals.durationDeltaMs! / signals.expectedDurationMs;

  if (signals.durationDeltaMs! <= absoluteToleranceMs || relativeDelta <= relativeTolerance) {
    return [postRenderPass(DURATION_CHECK_NAME)];
  }

  return [
    postRenderFail(
      DURATION_CHECK_NAME,
      `Rendered duration ${Math.round(signals.actualDurationMs)}ms differs from expected span ${Math.round(signals.expectedDurationMs)}ms by ${Math.round(signals.durationDeltaMs!)}ms`,
      "Verify trim boundaries, timeline padding, and event timestamps used for rendering",
    ),
  ];
}

export function checkSampleExtractionMetadata(ctx: RenderedVideoIntegrityContext): CheckResult[] {
  const metadata = ctx.sampleExtraction;
  if (!metadata) {
    return [
      { ...postRenderPass(EXTRACTION_CHECK_NAME), message: "No extraction metadata (skipped)" },
    ];
  }

  if (metadata.status === "failed") {
    const errorDetail = metadata.errors?.length ? `: ${metadata.errors.join("; ")}` : "";
    return [
      postRenderFail(
        EXTRACTION_CHECK_NAME,
        `Frame sample extraction reported failed status${errorDetail}`,
        "Regenerate frame sample metadata before trusting rendered video integrity checks",
      ),
    ];
  }

  if (metadata.status === "skipped") {
    return [
      postRenderWarn(
        EXTRACTION_CHECK_NAME,
        `Frame sample extraction was skipped (${metadata.extractedSampleCount}/${metadata.requestedSampleCount} requested samples)`,
      ),
    ];
  }

  if (metadata.errors && metadata.errors.length > 0) {
    return [
      postRenderFail(
        EXTRACTION_CHECK_NAME,
        `Frame sample extraction reported ${metadata.errors.length} error(s): ${metadata.errors.join("; ")}`,
        "Regenerate frame sample metadata before trusting rendered video integrity checks",
      ),
    ];
  }

  if (metadata.requestedSampleCount > 0 && metadata.extractedSampleCount === 0) {
    return [
      postRenderFail(
        EXTRACTION_CHECK_NAME,
        `Frame sample extraction returned 0/${metadata.requestedSampleCount} requested samples`,
        "Check that the rendered video exists and the sample extractor can read it",
      ),
    ];
  }

  if (metadata.extractedSampleCount < metadata.requestedSampleCount) {
    return [
      postRenderWarn(
        EXTRACTION_CHECK_NAME,
        `Frame sample extraction returned ${metadata.extractedSampleCount}/${metadata.requestedSampleCount} requested samples`,
      ),
    ];
  }

  return [postRenderPass(EXTRACTION_CHECK_NAME)];
}

export function checkRenderedVideoIntegrity(ctx: RenderedVideoIntegrityContext): CheckResult[] {
  return [
    ...checkSampleExtractionMetadata(ctx),
    ...checkBlankFrameRatio(ctx),
    ...checkFrozenAdjacentSampleRatio(ctx),
    ...checkDurationEventMismatch(ctx),
  ];
}
