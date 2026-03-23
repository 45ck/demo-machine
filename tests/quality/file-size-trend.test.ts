import { describe, it, expect, vi } from "vitest";
import { checkFileSizeTrend } from "../../src/quality/checks/file-size-trend.js";
import type { QualityCheckContext } from "../../src/quality/types.js";

function baseCtx(overrides?: Partial<QualityCheckContext>): QualityCheckContext {
  return {
    outputMp4Path: "/out/output.mp4",
    spec: { meta: { resolution: { width: 1920, height: 1080 } } },
    ...overrides,
  };
}

describe("checkFileSizeTrend", () => {
  it("passes when current size is within 30% of previous size", () => {
    const results = checkFileSizeTrend(baseCtx({ fileSizeBytes: 10_000_000 }), 10_500_000);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("warns when current size grew by more than 30%", () => {
    // previous: 10MB, current: 14MB -> 40% growth
    const results = checkFileSizeTrend(baseCtx({ fileSizeBytes: 14_000_000 }), 10_000_000);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
    expect(results[0]!.message).toContain("grew");
  });

  it("warns when current size shrank by more than 30%", () => {
    // previous: 10MB, current: 6MB -> 40% shrink
    const results = checkFileSizeTrend(baseCtx({ fileSizeBytes: 6_000_000 }), 10_000_000);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
    expect(results[0]!.message).toContain("shrank");
  });

  it("passes (skip) when no previous size is available", () => {
    const results = checkFileSizeTrend(baseCtx({ fileSizeBytes: 10_000_000 }), undefined);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.message).toMatch(/no previous/i);
  });

  it("passes (skip) when current fileSizeBytes is undefined", () => {
    const results = checkFileSizeTrend(baseCtx(), 10_000_000);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.message).toMatch(/current size unknown/i);
  });

  it("boundary: exactly 30% growth passes", () => {
    // previous: 10MB, current: 13MB -> exactly 30% growth
    const results = checkFileSizeTrend(baseCtx({ fileSizeBytes: 13_000_000 }), 10_000_000);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("boundary: exactly 30% shrink passes", () => {
    // previous: 10MB, current: 7MB -> exactly 30% shrink
    const results = checkFileSizeTrend(baseCtx({ fileSizeBytes: 7_000_000 }), 10_000_000);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("boundary: 30.1% growth warns", () => {
    // previous: 10MB, current: 13_010_001 -> just over 30.1%
    const results = checkFileSizeTrend(baseCtx({ fileSizeBytes: 13_010_001 }), 10_000_000);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
  });

  it("includes percentage in warning message", () => {
    const results = checkFileSizeTrend(baseCtx({ fileSizeBytes: 20_000_000 }), 10_000_000);
    expect(results[0]!.status).toBe("warn");
    expect(results[0]!.message).toMatch(/100/); // 100% growth
  });

  it("passes (skip) when previous size is 0 (first run produces empty)", () => {
    const results = checkFileSizeTrend(baseCtx({ fileSizeBytes: 10_000_000 }), 0);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.message).toMatch(/no previous/i);
  });

  it("all results have phase post-render and checkName file-size-trend", () => {
    const results = checkFileSizeTrend(baseCtx({ fileSizeBytes: 10_000_000 }), 10_000_000);
    expect(results[0]!.phase).toBe("post-render");
    expect(results[0]!.checkName).toBe("file-size-trend");
  });

  it("includes suggestion about what to investigate on regression", () => {
    const results = checkFileSizeTrend(baseCtx({ fileSizeBytes: 20_000_000 }), 10_000_000);
    expect(results[0]!.suggestion).toBeDefined();
    expect(results[0]!.suggestion).toContain("regression");
  });
});
