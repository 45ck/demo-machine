import { describe, expect, it, vi } from "vitest";
import {
  frameDiffPercent,
  frameStatus,
  reviewDemoVisualFramesWithPercent,
} from "../../scripts/video-evaluator-visual.mjs";

describe("video evaluator visual script adapter", () => {
  it("preserves command threshold units as percentages at the script boundary", async () => {
    const evaluator = {
      runDemoVisualReview: vi.fn(async (input) => ({
        report: {
          threshold: input.maxMismatchPercent,
          frames: [{ mismatchPercent: 0.0125, metadata: { status: "pass" } }],
        },
      })),
    };

    const result = await reviewDemoVisualFramesWithPercent({
      evaluator,
      thresholdPercent: 2,
      frames: [{ currentFramePath: "current.png", baselineFramePath: "baseline.png" }],
    });

    expect(evaluator.runDemoVisualReview).toHaveBeenCalledWith(
      expect.objectContaining({
        maxMismatchPercent: 0.02,
        pixelmatchThreshold: 0.1,
        missingBaselineStatus: "skip",
      }),
    );
    expect(result.report.threshold).toBe(0.02);
  });

  it("maps evaluator ratio/status fields back to legacy frame display values", () => {
    const frame = { mismatchPercent: 0.12345, metadata: { status: "fail" } };

    expect(frameDiffPercent(frame)).toBe(12.35);
    expect(frameStatus(frame)).toBe("fail");
  });
});
