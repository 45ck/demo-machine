import { describe, it, expect } from "vitest";
import type { QualityCheckContext } from "../../src/quality/types.js";
import { checkFrameRate } from "../../src/quality/checks/frame-rate.js";

function ctx(framePtsSec?: number[]): QualityCheckContext {
  return {
    outputMp4Path: "/out/output.mp4",
    spec: { meta: { resolution: { width: 1920, height: 1080 } } },
    framePtsSec,
  };
}

describe("checkFrameRate", () => {
  it("passes with consistent frame intervals (30fps)", () => {
    // 30fps = ~33.3ms intervals
    const pts = Array.from({ length: 90 }, (_, i) => i * (1 / 30));
    const results = checkFrameRate(ctx(pts));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("fails when frame drops detected (one interval is 3x the median)", () => {
    // Regular 30fps frames, but one big gap simulating a drop
    const pts = [0, 0.0333, 0.0666, 0.1, 0.2, 0.2333, 0.2666, 0.3];
    // The gap from 0.1 to 0.2 is ~100ms vs median ~33ms (>50% deviation)
    const results = checkFrameRate(ctx(pts));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("fail");
    expect(results[0]!.message).toMatch(/drop/i);
  });

  it("fails when duplicate timestamps detected (<1ms interval)", () => {
    const pts = [0, 0.0333, 0.0333, 0.0666, 0.1];
    // Second interval is 0ms (<1ms)
    const results = checkFrameRate(ctx(pts));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("fail");
    expect(results[0]!.message).toMatch(/duplicate/i);
  });

  it("passes (skip) when no framePtsSec provided", () => {
    const results = checkFrameRate(ctx(undefined));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.message).toMatch(/skip/i);
  });

  it("has phase post-render and checkName frame-rate:consistency", () => {
    const pts = Array.from({ length: 30 }, (_, i) => i * (1 / 30));
    const results = checkFrameRate(ctx(pts));
    expect(results[0]!.phase).toBe("post-render");
    expect(results[0]!.checkName).toBe("frame-rate:consistency");
  });

  it("message includes drop count and duplicate count on failure", () => {
    // Mix of drops and duplicates
    const pts = [0, 0.0333, 0.0333, 0.0666, 0.1, 0.2, 0.2333];
    const results = checkFrameRate(ctx(pts));
    expect(results[0]!.status).toBe("fail");
    // Should mention counts
    expect(results[0]!.message).toMatch(/\d+/);
  });

  it("handles single-frame video gracefully (no intervals to check)", () => {
    const results = checkFrameRate(ctx([0]));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("handles empty framePtsSec array gracefully", () => {
    const results = checkFrameRate(ctx([]));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("passes with consistent 60fps intervals", () => {
    const pts = Array.from({ length: 120 }, (_, i) => i * (1 / 60));
    const results = checkFrameRate(ctx(pts));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("computes correct median for even-length interval arrays", () => {
    // 4 PTS values = 3 intervals. Even-length interval array would be
    // [0.01, 0.02, 0.03] → median = 0.02 (middle value for odd-length).
    // But create 5 PTS → 4 intervals (even count), e.g. [0.01, 0.02, 0.03, 0.04]
    // median = (0.02 + 0.03) / 2 = 0.025 with the proper even-length formula.
    // All intervals within 50% of 0.025, so should pass.
    const pts = [0, 0.01, 0.03, 0.06, 0.1];
    // intervals: [0.01, 0.02, 0.03, 0.04] → sorted same
    // median = (0.02 + 0.03)/2 = 0.025
    // All within 50% of 0.025? 0.01 deviates by (0.025-0.01)/0.025=0.6 > 0.5 → drop
    const results = checkFrameRate(ctx(pts));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("fail");
    expect(results[0]!.message).toMatch(/drop/i);
  });

  it("filters NaN values from PTS data before processing", () => {
    // NaN values should be filtered out, leaving valid data
    const pts = [0, NaN, 0.0333, NaN, 0.0666, 0.1];
    const results = checkFrameRate(ctx(pts));
    expect(results).toHaveLength(1);
    // After filtering NaN, we have [0, 0.0333, 0.0666, 0.1] which is consistent
    expect(results[0]!.status).toBe("pass");
  });

  it("skips gracefully when all PTS values are NaN", () => {
    const pts = [NaN, NaN, NaN];
    const results = checkFrameRate(ctx(pts));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.message).toMatch(/skip/i);
  });

  it("filters Infinity values from PTS data", () => {
    const pts = [0, Infinity, 0.0333, -Infinity, 0.0666, 0.1];
    const results = checkFrameRate(ctx(pts));
    expect(results).toHaveLength(1);
    // After filtering, we have [0, 0.0333, 0.0666, 0.1] which is consistent
    expect(results[0]!.status).toBe("pass");
  });
});
