import { describe, it, expect } from "vitest";
import type { QualityCheckContext } from "../../../src/quality/types.js";
import { checkCursorPosition } from "../../../src/quality/checks/visual/cursor-position.js";

function baseCtx(overrides?: Partial<QualityCheckContext>): QualityCheckContext {
  return {
    outputMp4Path: "/out/output.mp4",
    spec: { meta: { resolution: { width: 1920, height: 1080 } } },
    ...overrides,
  };
}

describe("checkCursorPosition", () => {
  it("warns when no cursor position data is provided", () => {
    const results = checkCursorPosition(baseCtx());
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
    expect(results[0]!.message).toContain("skipped");
  });

  it("warns when cursorPositions is empty array", () => {
    const results = checkCursorPosition(baseCtx({ cursorPositions: [] }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
  });

  it("passes when cursor is exactly at target center", () => {
    const positions = [
      { stepIndex: 0, cursorX: 100, cursorY: 200, targetCenterX: 100, targetCenterY: 200 },
    ];
    const results = checkCursorPosition(baseCtx({ cursorPositions: positions }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("passes when cursor is within 5px tolerance", () => {
    const positions = [
      { stepIndex: 0, cursorX: 103, cursorY: 204, targetCenterX: 100, targetCenterY: 200 },
    ];
    const results = checkCursorPosition(baseCtx({ cursorPositions: positions }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("passes when cursor is exactly at 5px distance", () => {
    // Distance = sqrt(3^2 + 4^2) = 5
    const positions = [
      { stepIndex: 0, cursorX: 103, cursorY: 204, targetCenterX: 100, targetCenterY: 200 },
    ];
    const results = checkCursorPosition(baseCtx({ cursorPositions: positions }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("fails when cursor is beyond 5px tolerance", () => {
    const positions = [
      { stepIndex: 2, cursorX: 110, cursorY: 200, targetCenterX: 100, targetCenterY: 200 },
    ];
    const results = checkCursorPosition(baseCtx({ cursorPositions: positions }));
    const fail = results.find((r) => r.status === "fail");
    expect(fail).toBeDefined();
    expect(fail!.message).toContain("Step 2");
    expect(fail!.message).toContain("10.0px");
    expect(fail!.message).toContain("(110,200)");
    expect(fail!.message).toContain("(100,200)");
  });

  it("passes all positions when all within tolerance", () => {
    const positions = [
      { stepIndex: 0, cursorX: 100, cursorY: 200, targetCenterX: 100, targetCenterY: 200 },
      { stepIndex: 1, cursorX: 301, cursorY: 402, targetCenterX: 300, targetCenterY: 400 },
      { stepIndex: 2, cursorX: 500, cursorY: 500, targetCenterX: 502, targetCenterY: 503 },
    ];
    const results = checkCursorPosition(baseCtx({ cursorPositions: positions }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("reports each failing position separately", () => {
    const positions = [
      { stepIndex: 0, cursorX: 100, cursorY: 200, targetCenterX: 100, targetCenterY: 200 },
      { stepIndex: 1, cursorX: 120, cursorY: 200, targetCenterX: 100, targetCenterY: 200 },
      { stepIndex: 2, cursorX: 100, cursorY: 220, targetCenterX: 100, targetCenterY: 200 },
    ];
    const results = checkCursorPosition(baseCtx({ cursorPositions: positions }));
    const fails = results.filter((r) => r.status === "fail");
    expect(fails).toHaveLength(2);
    expect(fails[0]!.message).toContain("Step 1");
    expect(fails[1]!.message).toContain("Step 2");
  });

  it("includes suggestion about tolerance", () => {
    const positions = [
      { stepIndex: 0, cursorX: 120, cursorY: 200, targetCenterX: 100, targetCenterY: 200 },
    ];
    const results = checkCursorPosition(baseCtx({ cursorPositions: positions }));
    const fail = results.find((r) => r.status === "fail");
    expect(fail!.suggestion).toContain("5px");
  });

  it("all results have phase post-render", () => {
    const positions = [
      { stepIndex: 0, cursorX: 100, cursorY: 200, targetCenterX: 100, targetCenterY: 200 },
    ];
    const results = checkCursorPosition(baseCtx({ cursorPositions: positions }));
    for (const r of results) {
      expect(r.phase).toBe("post-render");
    }
  });
});
