import { describe, it, expect } from "vitest";
import { runPhase } from "../../../src/validation/registry.js";
import type { CheckContext } from "../../../src/validation/types.js";

// Import to trigger registration
import "../../../src/validation/checks/narration-checks.js";

function makeCtx(chapters: unknown[], options?: Record<string, unknown>): CheckContext {
  return {
    spec: { meta: { title: "T" }, chapters },
    specDir: "/tmp",
    options: { narration: true, ...options },
  };
}

function narrationTimingResults(chapters: unknown[], options?: Record<string, unknown>) {
  return runPhase("pre-capture", makeCtx(chapters, options)).then((all) =>
    all.filter((r) => r.checkName === "narration-timing"),
  );
}

describe("narration-timing check", () => {
  it("passes when narration is off", async () => {
    const results = await narrationTimingResults(
      [{ title: "C", steps: [{ action: "click", selector: "#x" }] }],
      { narration: false },
    );
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("pass");
  });

  it("warns on very long narration text", async () => {
    const longText = "A".repeat(501);
    const results = await narrationTimingResults([
      { title: "C", steps: [{ action: "click", selector: "#x", narration: longText }] },
    ]);
    expect(results.some((r) => r.status === "warn" && r.message.includes("501 chars"))).toBe(true);
  });

  it("warns on very short narration text", async () => {
    const results = await narrationTimingResults([
      { title: "C", steps: [{ action: "click", selector: "#x", narration: "Hi" }] },
    ]);
    expect(results.some((r) => r.status === "warn" && r.message.includes("very short"))).toBe(true);
  });
});
