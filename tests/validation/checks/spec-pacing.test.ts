import { describe, it, expect } from "vitest";
import { runPhase } from "../../../src/validation/registry.js";
import type { CheckContext } from "../../../src/validation/types.js";

// Import to trigger registration
import "../../../src/validation/checks/spec-pacing.js";

function makeCtx(pacing?: unknown): CheckContext {
  return {
    spec: {
      meta: { title: "Test" },
      chapters: [{ title: "Ch1", steps: [{ action: "navigate", url: "http://localhost:3000" }] }],
      pacing,
    },
    specDir: "/tmp",
  };
}

function pacingResults(pacing?: unknown) {
  return runPhase("pre-capture", makeCtx(pacing)).then((all) =>
    all.filter((r) => r.checkName === "spec-pacing"),
  );
}

describe("spec-pacing check", () => {
  it("passes with valid pacing values", async () => {
    const results = await pacingResults({ cursorDurationMs: 600, typeDelayMs: 50 });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("pass");
  });

  it("fails on negative pacing value", async () => {
    const results = await pacingResults({ cursorDurationMs: -1 });
    expect(results.some((r) => r.status === "fail")).toBe(true);
    expect(results.some((r) => r.message.includes("cursorDurationMs"))).toBe(true);
  });

  it("passes when no pacing is specified", async () => {
    const results = await pacingResults(undefined);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("pass");
  });
});
