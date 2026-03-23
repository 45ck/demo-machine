import { describe, it, expect } from "vitest";

/**
 * Tests for FIX-A: Narration actionIndex mapping for non-contiguous narration.
 *
 * The mapping logic builds a lookup from narration segment index to flat step
 * index by walking spec chapters and recording only steps that have narration.
 * This is the same logic used in `runPostRenderQualityGate` in pipeline.ts.
 */

interface MinimalStep {
  action: string;
  narration?: string;
}

interface MinimalSpec {
  chapters?: Array<{ steps?: MinimalStep[] }>;
}

/** Extracted mapping logic (mirrors pipeline.ts implementation). */
function buildNarrationToActionMap(spec: MinimalSpec): number[] {
  const narrationToAction: number[] = [];
  let stepIdx = 0;
  for (const chapter of spec.chapters ?? []) {
    for (const step of chapter.steps ?? []) {
      if (step.narration) narrationToAction.push(stepIdx);
      stepIdx++;
    }
  }
  return narrationToAction;
}

describe("narration actionIndex mapping", () => {
  it("maps contiguous narration 1:1 with step indices", () => {
    const spec: MinimalSpec = {
      chapters: [
        {
          steps: [
            { action: "click", narration: "Click here" },
            { action: "type", narration: "Type text" },
            { action: "assert", narration: "Verify result" },
          ],
        },
      ],
    };
    const map = buildNarrationToActionMap(spec);
    expect(map).toEqual([0, 1, 2]);
  });

  it("maps non-contiguous narration to correct step indices", () => {
    const spec: MinimalSpec = {
      chapters: [
        {
          steps: [
            { action: "navigate" }, // step 0, no narration
            { action: "click", narration: "Click the button" }, // step 1 → segment 0
            { action: "wait" }, // step 2, no narration
            { action: "type", narration: "Enter your name" }, // step 3 → segment 1
            { action: "assert" }, // step 4, no narration
          ],
        },
      ],
    };
    const map = buildNarrationToActionMap(spec);
    expect(map).toEqual([1, 3]);
  });

  it("handles multiple chapters with sparse narration", () => {
    const spec: MinimalSpec = {
      chapters: [
        {
          steps: [
            { action: "navigate" }, // step 0
            { action: "click", narration: "First click" }, // step 1 → segment 0
          ],
        },
        {
          steps: [
            { action: "navigate" }, // step 2
            { action: "type" }, // step 3, no narration
            { action: "click", narration: "Second click" }, // step 4 → segment 1
          ],
        },
      ],
    };
    const map = buildNarrationToActionMap(spec);
    expect(map).toEqual([1, 4]);
  });

  it("returns empty array when no steps have narration", () => {
    const spec: MinimalSpec = {
      chapters: [
        {
          steps: [{ action: "navigate" }, { action: "click" }, { action: "assert" }],
        },
      ],
    };
    const map = buildNarrationToActionMap(spec);
    expect(map).toEqual([]);
  });

  it("handles empty chapters gracefully", () => {
    const spec: MinimalSpec = {
      chapters: [{ steps: [] }, { steps: [{ action: "click", narration: "Only one" }] }],
    };
    const map = buildNarrationToActionMap(spec);
    expect(map).toEqual([0]);
  });

  it("handles spec with no chapters", () => {
    const spec: MinimalSpec = {};
    const map = buildNarrationToActionMap(spec);
    expect(map).toEqual([]);
  });
});
