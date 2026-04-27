import { describe, it, expect } from "vitest";
import type { QualityCheckContext } from "../../src/quality/types.js";
import { checkNarrationOrdering } from "../../src/quality/checks/narration-ordering.js";

function ctx(
  events: Array<{ action: string; timestamp: number; duration: number }>,
  narrationSegments: Array<{
    actionIndex: number;
    startMs: number;
    durationMs?: number;
    text: string;
  }>,
): QualityCheckContext {
  return {
    outputMp4Path: "/out/output.mp4",
    spec: { meta: { resolution: { width: 1920, height: 1080 } } },
    events,
    narrationSegments,
  };
}

describe("checkNarrationOrdering", () => {
  it("passes when all narration segments start before their action timestamp", () => {
    const events = [
      { action: "click", timestamp: 1000, duration: 200 },
      { action: "type", timestamp: 3000, duration: 500 },
    ];
    const segments = [
      { actionIndex: 0, startMs: 500, text: "Click the button" },
      { actionIndex: 1, startMs: 2500, text: "Type the text" },
    ];
    const results = checkNarrationOrdering(ctx(events, segments));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("passes when narration starts exactly at the action timestamp", () => {
    const events = [{ action: "click", timestamp: 1000, duration: 200 }];
    const segments = [{ actionIndex: 0, startMs: 1000, text: "Click the button" }];
    const results = checkNarrationOrdering(ctx(events, segments));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("fails when any narration starts after its action timestamp", () => {
    const events = [{ action: "click", timestamp: 1000, duration: 200 }];
    const segments = [{ actionIndex: 0, startMs: 1500, text: "Click the button" }];
    const results = checkNarrationOrdering(ctx(events, segments));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("fail");
    expect(results[0]!.message).toContain("500");
  });

  it("passes (skip) when no narration segments provided", () => {
    const c: QualityCheckContext = {
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      events: [{ action: "click", timestamp: 1000, duration: 200 }],
    };
    const results = checkNarrationOrdering(c);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.message).toMatch(/skip/i);
  });

  it("passes (skip) when no events provided", () => {
    const c: QualityCheckContext = {
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      narrationSegments: [{ actionIndex: 0, startMs: 500, text: "Click the button" }],
    };
    const results = checkNarrationOrdering(c);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.message).toMatch(/skip/i);
  });

  it("fails with correct checkName narration:temporal-ordering", () => {
    const events = [{ action: "click", timestamp: 1000, duration: 200 }];
    const segments = [{ actionIndex: 0, startMs: 1500, text: "Click the button" }];
    const results = checkNarrationOrdering(ctx(events, segments));
    expect(results[0]!.checkName).toBe("narration:temporal-ordering");
  });

  it("all results have phase post-render", () => {
    const events = [{ action: "click", timestamp: 1000, duration: 200 }];
    const segments = [{ actionIndex: 0, startMs: 500, text: "Click the button" }];
    const results = checkNarrationOrdering(ctx(events, segments));
    for (const r of results) {
      expect(r.phase).toBe("post-render");
    }
  });

  it("message includes the step index and text of the offending segment", () => {
    const events = [{ action: "click", timestamp: 1000, duration: 200 }];
    const segments = [{ actionIndex: 0, startMs: 1500, text: "Click the button" }];
    const results = checkNarrationOrdering(ctx(events, segments));
    expect(results[0]!.message).toContain("step 0");
    expect(results[0]!.message).toContain("Click the button");
  });

  it("fails when an action occurs after its narration has already ended", () => {
    const events = [{ action: "click", timestamp: 3000, duration: 200 }];
    const segments = [
      { actionIndex: 0, startMs: 1000, durationMs: 1000, text: "Click the button" },
    ];
    const results = checkNarrationOrdering(ctx(events, segments));
    expect(results[0]!.status).toBe("fail");
    expect(results[0]!.message).toContain("after narration ends");
  });

  it("fails when adjacent narration segments overlap", () => {
    const events = [
      { action: "click", timestamp: 1000, duration: 200 },
      { action: "type", timestamp: 2500, duration: 200 },
    ];
    const segments = [
      { actionIndex: 0, startMs: 500, durationMs: 2500, text: "Click the button" },
      { actionIndex: 1, startMs: 2000, durationMs: 1000, text: "Type the text" },
    ];
    const results = checkNarrationOrdering(ctx(events, segments));
    expect(results[0]!.status).toBe("fail");
    expect(results[0]!.message).toContain("overlap");
  });

  it("handles multiple violations (reports all, not just first)", () => {
    const events = [
      { action: "click", timestamp: 1000, duration: 200 },
      { action: "type", timestamp: 3000, duration: 500 },
      { action: "click", timestamp: 5000, duration: 200 },
    ];
    const segments = [
      { actionIndex: 0, startMs: 1500, text: "Click first" },
      { actionIndex: 1, startMs: 2500, text: "Type some text" },
      { actionIndex: 2, startMs: 6000, text: "Click second" },
    ];
    const results = checkNarrationOrdering(ctx(events, segments));
    // Should fail — two violations (step 0 and step 2), step 1 is fine
    const failResult = results.find((r) => r.status === "fail");
    expect(failResult).toBeDefined();
    expect(failResult!.message).toContain("step 0");
    expect(failResult!.message).toContain("step 2");
    expect(failResult!.message).not.toContain("step 1");
  });

  it("warns when narration segments have out-of-bounds actionIndex", () => {
    const events = [{ action: "click", timestamp: 1000, duration: 200 }];
    const segments = [
      { actionIndex: 0, startMs: 500, text: "Valid segment" },
      { actionIndex: 99, startMs: 500, text: "Invalid segment" },
    ];
    const results = checkNarrationOrdering(ctx(events, segments));
    const warnResult = results.find((r) => r.status === "warn");
    expect(warnResult).toBeDefined();
    expect(warnResult!.message).toContain("1 narration segment(s) had no matching event");
  });

  it("warns with correct count when multiple segments have out-of-bounds actionIndex", () => {
    const events = [{ action: "click", timestamp: 1000, duration: 200 }];
    const segments = [
      { actionIndex: 5, startMs: 500, text: "Bad 1" },
      { actionIndex: 10, startMs: 500, text: "Bad 2" },
      { actionIndex: 20, startMs: 500, text: "Bad 3" },
    ];
    const results = checkNarrationOrdering(ctx(events, segments));
    const warnResult = results.find((r) => r.status === "warn");
    expect(warnResult).toBeDefined();
    expect(warnResult!.message).toContain("3 narration segment(s) had no matching event");
  });

  it("reports both skipped segments and timing violations", () => {
    const events = [{ action: "click", timestamp: 1000, duration: 200 }];
    const segments = [
      { actionIndex: 0, startMs: 1500, text: "Late narration" },
      { actionIndex: 99, startMs: 500, text: "Out of bounds" },
    ];
    const results = checkNarrationOrdering(ctx(events, segments));
    expect(results.some((r) => r.status === "warn")).toBe(true);
    expect(results.some((r) => r.status === "fail")).toBe(true);
  });
});
