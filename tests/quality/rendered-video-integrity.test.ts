import { describe, it, expect } from "vitest";
import {
  analyzeRenderedVideoIntegrity,
  checkBlankFrameRatio,
  checkDurationEventMismatch,
  checkFrozenAdjacentSampleRatio,
  checkRenderedVideoIntegrity,
  checkSampleExtractionMetadata,
  computeExpectedEventDurationMs,
  computeExpectedNarrationDurationMs,
} from "../../src/quality/checks/rendered-video-integrity.js";
import type {
  RenderedVideoFrameSample,
  RenderedVideoIntegrityContext,
} from "../../src/quality/checks/rendered-video-integrity.js";

function sample(
  timestampMs: number,
  overrides: Partial<RenderedVideoFrameSample> = {},
): RenderedVideoFrameSample {
  return { timestampMs, lumaMean: 40, lumaStdDev: 8, differenceFromPrevious: 0.5, ...overrides };
}

function ctx(
  overrides: Partial<RenderedVideoIntegrityContext> = {},
): RenderedVideoIntegrityContext {
  return overrides;
}

describe("rendered video integrity checks", () => {
  it("computes blank and frozen sample signals from injected sample data", () => {
    const signals = analyzeRenderedVideoIntegrity(
      ctx({
        frameSamples: [
          sample(0, { blank: true }),
          sample(1000, { frozenWithPrevious: true }),
          sample(2000, { lumaMean: 1, lumaStdDev: 0.5 }),
        ],
        sampleExtraction: { requestedSampleCount: 3, extractedSampleCount: 3 },
      }),
    );

    expect(signals.sampleCount).toBe(3);
    expect(signals.blankFrameCount).toBe(2);
    expect(signals.blankFrameRatio).toBeCloseTo(2 / 3);
    expect(signals.adjacentPairCount).toBe(2);
    expect(signals.frozenAdjacentPairCount).toBe(1);
    expect(signals.frozenAdjacentSampleRatio).toBeCloseTo(1 / 2);
    expect(signals.extractionRequestedSampleCount).toBe(3);
    expect(signals.extractionExtractedSampleCount).toBe(3);
  });

  it("fails when blank frame ratio exceeds the configured threshold", () => {
    const results = checkBlankFrameRatio(
      ctx({
        frameSamples: [sample(0, { blank: true }), sample(1000, { blank: true }), sample(2000)],
        thresholds: { blankRatio: 0.5 },
      }),
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("fail");
    expect(results[0]!.checkName).toBe("rendered-video:blank-frame-ratio");
    expect(results[0]!.message).toContain("2/3");
  });

  it("passes blank frame ratio when no samples exist and marks it skipped", () => {
    const results = checkBlankFrameRatio(ctx());

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.message).toMatch(/skipped/i);
  });

  it("detects frozen adjacent samples by difference score and hash equality", () => {
    const results = checkFrozenAdjacentSampleRatio(
      ctx({
        frameSamples: [
          sample(0, { perceptualHash: "a" }),
          sample(1000, { perceptualHash: "a" }),
          sample(2000, { differenceFromPrevious: 0.001 }),
          sample(3000, { differenceFromPrevious: 0.4 }),
        ],
        thresholds: { frozenAdjacentRatio: 0.5 },
      }),
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("fail");
    expect(results[0]!.checkName).toBe("rendered-video:frozen-adjacent-ratio");
    expect(results[0]!.message).toContain("2/3");
  });

  it("passes frozen ratio when there is only one valid sample", () => {
    const results = checkFrozenAdjacentSampleRatio(ctx({ frameSamples: [sample(0)] }));

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.message).toMatch(/skipped/i);
  });

  it("warns instead of failing when a long sample set is just over the frozen threshold", () => {
    const frameSamples = Array.from({ length: 48 }, (_, i) =>
      sample(i * 1000, { frozenWithPrevious: i > 0 && i <= 17 }),
    );

    const results = checkFrozenAdjacentSampleRatio(
      ctx({
        frameSamples,
        thresholds: { frozenAdjacentRatio: 0.35 },
      }),
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
    expect(results[0]!.message).toContain("slightly above");
  });

  it("computes expected duration from event span", () => {
    const expected = computeExpectedEventDurationMs([
      { action: "navigate", timestamp: 1000, duration: 500 },
      { action: "click", timestamp: 2500, duration: 250 },
    ]);

    expect(expected).toBe(1750);
  });

  it("computes expected duration from narration span", () => {
    const expected = computeExpectedNarrationDurationMs([
      { actionIndex: 0, startMs: 0, durationMs: 1200, text: "Intro" },
      { actionIndex: 1, startMs: 4500, durationMs: 2000, text: "Outro" },
    ]);

    expect(expected).toBe(6500);
  });

  it("ignores malformed events when computing expected duration", () => {
    const expected = computeExpectedEventDurationMs([
      { action: "bad-start", timestamp: Number.NaN, duration: 500 },
      { action: "bad-duration", timestamp: 1000, duration: Number.POSITIVE_INFINITY },
      { action: "click", timestamp: 2500, duration: 250 },
    ]);

    expect(expected).toBe(250);
  });

  it("fails when rendered duration differs substantially from event span", () => {
    const results = checkDurationEventMismatch(
      ctx({
        videoDurationMs: 6000,
        events: [
          { action: "navigate", timestamp: 1000, duration: 500 },
          { action: "click", timestamp: 2500, duration: 500 },
        ],
        thresholds: { durationAbsoluteToleranceMs: 500, durationRelativeTolerance: 0.1 },
      }),
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("fail");
    expect(results[0]!.message).toContain("6000ms");
    expect(results[0]!.message).toContain("2000ms");
  });

  it("uses narration duration when narration extends beyond the event span", () => {
    const results = checkDurationEventMismatch(
      ctx({
        videoDurationMs: 6400,
        events: [{ action: "click", timestamp: 1000, duration: 500 }],
        narrationSegments: [{ actionIndex: 0, startMs: 0, durationMs: 6500, text: "Long" }],
        thresholds: { durationAbsoluteToleranceMs: 250 },
      }),
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("passes duration mismatch when absolute tolerance covers the delta", () => {
    const results = checkDurationEventMismatch(
      ctx({
        videoDurationMs: 2400,
        events: [
          { action: "navigate", timestamp: 1000, duration: 500 },
          { action: "click", timestamp: 2500, duration: 500 },
        ],
        thresholds: { durationAbsoluteToleranceMs: 500 },
      }),
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("skips duration mismatch when duration or events are absent", () => {
    expect(checkDurationEventMismatch(ctx({ videoDurationMs: 1000 }))[0]!.message).toMatch(
      /events.*skipped/i,
    );
    expect(
      checkDurationEventMismatch(
        ctx({ events: [{ action: "click", timestamp: 0, duration: 1000 }] }),
      )[0]!.message,
    ).toMatch(/duration.*skipped/i);
  });

  it("reports extraction metadata errors and partial extraction", () => {
    const failed = checkSampleExtractionMetadata(
      ctx({
        sampleExtraction: {
          requestedSampleCount: 4,
          extractedSampleCount: 2,
          errors: ["decoder failed"],
        },
      }),
    );
    const warned = checkSampleExtractionMetadata(
      ctx({ sampleExtraction: { requestedSampleCount: 4, extractedSampleCount: 2 } }),
    );

    expect(failed[0]!.status).toBe("fail");
    expect(failed[0]!.message).toContain("decoder failed");
    expect(warned[0]!.status).toBe("warn");
    expect(warned[0]!.message).toContain("2/4");
  });

  it("fails or warns clearly when extraction metadata reports failed or skipped status", () => {
    const failed = checkSampleExtractionMetadata(
      ctx({
        sampleExtraction: {
          requestedSampleCount: 4,
          extractedSampleCount: 0,
          status: "failed",
          errors: ["ffmpeg exited 1"],
        },
      }),
    );
    const skipped = checkSampleExtractionMetadata(
      ctx({
        sampleExtraction: {
          requestedSampleCount: 4,
          extractedSampleCount: 0,
          status: "skipped",
        },
      }),
    );

    expect(failed[0]!.status).toBe("fail");
    expect(failed[0]!.message).toContain("failed status");
    expect(failed[0]!.message).toContain("ffmpeg exited 1");
    expect(skipped[0]!.status).toBe("warn");
    expect(skipped[0]!.message).toContain("skipped");
  });

  it("aggregates all rendered video integrity checks", () => {
    const results = checkRenderedVideoIntegrity(
      ctx({
        videoDurationMs: 2000,
        events: [{ action: "click", timestamp: 0, duration: 2000 }],
        frameSamples: [sample(0), sample(1000)],
        sampleExtraction: { requestedSampleCount: 2, extractedSampleCount: 2 },
      }),
    );

    expect(results).toHaveLength(4);
    expect(results.every((result) => result.phase === "post-render")).toBe(true);
    expect(results.every((result) => result.status === "pass")).toBe(true);
  });
});
