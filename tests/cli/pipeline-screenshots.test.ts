import { describe, it, expect } from "vitest";

/**
 * Tests for the screenshot collector → quality gate integration shape.
 *
 * The actual pipeline is heavily integration-dependent (Playwright, ffmpeg, etc.),
 * so we test the data shape transformation: collector results → quality gate params.
 */

interface CollectorResults {
  stepScreenshots: Map<number, Buffer>;
  assertScreenshotPairs: Array<{ stepIndex: number; before: Buffer; after: Buffer }>;
  cursorPositions: Array<{
    stepIndex: number;
    cursorX: number;
    cursorY: number;
    targetCenterX: number;
    targetCenterY: number;
  }>;
  chapterTitleScreenshots: Map<number, Buffer>;
}

/**
 * Mirrors the spreading logic that pipeline.ts uses to pass collector results
 * into the quality gate context. This validates the shape contract.
 */
function buildQualityGateScreenshotParams(results: CollectorResults): {
  stepScreenshots?: Map<number, Buffer>;
  assertScreenshotPairs?: Array<{ stepIndex: number; before: Buffer; after: Buffer }>;
  cursorPositions?: Array<{
    stepIndex: number;
    cursorX: number;
    cursorY: number;
    targetCenterX: number;
    targetCenterY: number;
  }>;
  chapterTitleScreenshots?: Map<number, Buffer>;
} {
  return {
    ...(results.stepScreenshots.size > 0 ? { stepScreenshots: results.stepScreenshots } : {}),
    ...(results.assertScreenshotPairs.length > 0
      ? { assertScreenshotPairs: results.assertScreenshotPairs }
      : {}),
    ...(results.cursorPositions.length > 0 ? { cursorPositions: results.cursorPositions } : {}),
    ...(results.chapterTitleScreenshots.size > 0
      ? { chapterTitleScreenshots: results.chapterTitleScreenshots }
      : {}),
  };
}

describe("pipeline screenshot integration shape", () => {
  it("passes populated collector results to quality gate params", () => {
    const results: CollectorResults = {
      stepScreenshots: new Map([
        [0, Buffer.from("step0")],
        [1, Buffer.from("step1")],
      ]),
      assertScreenshotPairs: [
        { stepIndex: 2, before: Buffer.from("before"), after: Buffer.from("after") },
      ],
      cursorPositions: [
        { stepIndex: 1, cursorX: 100, cursorY: 200, targetCenterX: 100, targetCenterY: 200 },
      ],
      chapterTitleScreenshots: new Map([[0, Buffer.from("ch0")]]),
    };

    const params = buildQualityGateScreenshotParams(results);

    expect(params.stepScreenshots).toBe(results.stepScreenshots);
    expect(params.assertScreenshotPairs).toBe(results.assertScreenshotPairs);
    expect(params.cursorPositions).toBe(results.cursorPositions);
    expect(params.chapterTitleScreenshots).toBe(results.chapterTitleScreenshots);
  });

  it("omits empty collections from quality gate params", () => {
    const results: CollectorResults = {
      stepScreenshots: new Map(),
      assertScreenshotPairs: [],
      cursorPositions: [],
      chapterTitleScreenshots: new Map(),
    };

    const params = buildQualityGateScreenshotParams(results);

    expect(params.stepScreenshots).toBeUndefined();
    expect(params.assertScreenshotPairs).toBeUndefined();
    expect(params.cursorPositions).toBeUndefined();
    expect(params.chapterTitleScreenshots).toBeUndefined();
  });

  it("passes partial results when only some collections are populated", () => {
    const results: CollectorResults = {
      stepScreenshots: new Map([[0, Buffer.from("step0")]]),
      assertScreenshotPairs: [],
      cursorPositions: [
        { stepIndex: 0, cursorX: 50, cursorY: 60, targetCenterX: 50, targetCenterY: 60 },
      ],
      chapterTitleScreenshots: new Map(),
    };

    const params = buildQualityGateScreenshotParams(results);

    expect(params.stepScreenshots).toBeDefined();
    expect(params.assertScreenshotPairs).toBeUndefined();
    expect(params.cursorPositions).toBeDefined();
    expect(params.chapterTitleScreenshots).toBeUndefined();
  });
});
