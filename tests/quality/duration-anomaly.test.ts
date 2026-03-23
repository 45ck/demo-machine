import { describe, it, expect } from "vitest";
import type { QualityCheckContext } from "../../src/quality/types.js";
import { checkDurationAnomalies } from "../../src/quality/checks/duration-anomaly.js";

function makeCtx(overrides: Partial<QualityCheckContext> = {}): QualityCheckContext {
  return {
    outputMp4Path: "/out/output.mp4",
    spec: { meta: { resolution: { width: 1920, height: 1080 } } },
    ...overrides,
  };
}

describe("checkDurationAnomalies", () => {
  it("passes when all durations are within 2x historical median", () => {
    const ctx = makeCtx({
      events: [
        { action: "click", timestamp: 0, duration: 120 },
        { action: "click", timestamp: 500, duration: 150 },
        { action: "type", timestamp: 1000, duration: 200 },
      ],
      timingHistory: {
        click: [100, 110, 130, 120, 140],
        type: [180, 200, 210, 190, 220],
      },
    });
    const results = checkDurationAnomalies(ctx);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("fails when a step exceeds 2x the median", () => {
    const ctx = makeCtx({
      events: [
        { action: "click", timestamp: 0, duration: 100 },
        { action: "click", timestamp: 500, duration: 500 }, // 500 > 2 * 120 = 240
      ],
      timingHistory: {
        click: [100, 110, 120, 130, 140],
      },
    });
    const results = checkDurationAnomalies(ctx);
    const failures = results.filter((r) => r.status === "fail");
    expect(failures.length).toBeGreaterThanOrEqual(1);
    const failMsg = failures[0]!.message;
    expect(failMsg).toContain("click");
    expect(failMsg).toMatch(/500/);
    expect(failMsg).toMatch(/120/);
  });

  it("passes (skip) when no timingHistory provided", () => {
    const ctx = makeCtx({
      events: [{ action: "click", timestamp: 0, duration: 100 }],
    });
    const results = checkDurationAnomalies(ctx);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.message).toMatch(/skip/i);
  });

  it("passes (skip) when no events provided", () => {
    const ctx = makeCtx({
      timingHistory: { click: [100, 120, 130] },
    });
    const results = checkDurationAnomalies(ctx);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.message).toMatch(/skip/i);
  });

  it("handles action types with no historical data (skip that action)", () => {
    const ctx = makeCtx({
      events: [
        { action: "click", timestamp: 0, duration: 100 },
        { action: "dragAndDrop", timestamp: 500, duration: 3000 },
      ],
      timingHistory: {
        click: [100, 110, 120, 130, 140],
        // no dragAndDrop history
      },
    });
    const results = checkDurationAnomalies(ctx);
    // dragAndDrop has no history so it's skipped, click is fine
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("handles single historical entry (no meaningful median, skip)", () => {
    const ctx = makeCtx({
      events: [{ action: "click", timestamp: 0, duration: 5000 }],
      timingHistory: {
        click: [100], // only 1 entry — insufficient for meaningful comparison
      },
    });
    const results = checkDurationAnomalies(ctx);
    // With only 1 historical entry, should skip that action type
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("all results have phase post-render and checkName duration:anomaly", () => {
    const ctx = makeCtx({
      events: [{ action: "click", timestamp: 0, duration: 100 }],
      timingHistory: { click: [100, 110, 120] },
    });
    const results = checkDurationAnomalies(ctx);
    for (const r of results) {
      expect(r.phase).toBe("post-render");
      expect(r.checkName).toBe("duration:anomaly");
    }
  });

  it("reports multiple anomalies from different action types", () => {
    const ctx = makeCtx({
      events: [
        { action: "click", timestamp: 0, duration: 800 }, // 800 > 2 * 120 = 240
        { action: "type", timestamp: 500, duration: 1000 }, // 1000 > 2 * 200 = 400
      ],
      timingHistory: {
        click: [100, 110, 120, 130, 140],
        type: [180, 190, 200, 210, 220],
      },
    });
    const results = checkDurationAnomalies(ctx);
    const failures = results.filter((r) => r.status === "fail");
    expect(failures.length).toBe(2);
  });

  it("uses median correctly for even-length arrays", () => {
    // Median of [100, 200, 300, 400] = (200+300)/2 = 250
    // 2x median = 500
    const ctx = makeCtx({
      events: [{ action: "click", timestamp: 0, duration: 501 }],
      timingHistory: {
        click: [100, 200, 300, 400],
      },
    });
    const results = checkDurationAnomalies(ctx);
    const failures = results.filter((r) => r.status === "fail");
    expect(failures.length).toBe(1);
  });

  it("passes at exactly 2x the median boundary", () => {
    // Median of [100, 110, 120, 130, 140] = 120
    // 2x median = 240; duration 240 should pass (not strictly greater)
    const ctx = makeCtx({
      events: [{ action: "click", timestamp: 0, duration: 240 }],
      timingHistory: {
        click: [100, 110, 120, 130, 140],
      },
    });
    const results = checkDurationAnomalies(ctx);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("includes event index in failure message", () => {
    const ctx = makeCtx({
      events: [
        { action: "click", timestamp: 0, duration: 100 },
        { action: "click", timestamp: 500, duration: 600 },
      ],
      timingHistory: {
        click: [100, 110, 120, 130, 140],
      },
    });
    const results = checkDurationAnomalies(ctx);
    const failure = results.find((r) => r.status === "fail");
    expect(failure).toBeDefined();
    expect(failure!.message).toMatch(/1/); // event index 1
  });

  it("skips when history median is zero (no meaningful baseline)", () => {
    const ctx = makeCtx({
      events: [{ action: "click", timestamp: 0, duration: 100 }],
      timingHistory: {
        click: [0, 0, 0, 0, 0],
      },
    });
    const results = checkDurationAnomalies(ctx);
    // With all-zero history, median=0 and threshold=0.
    // Without the fix, every positive duration would be anomalous.
    // With the fix, we skip this action type entirely.
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });
});
