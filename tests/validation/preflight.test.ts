import { describe, it, expect } from "vitest";
import { preflight, PreflightError } from "../../src/validation/preflight.js";
import type { CheckContext } from "../../src/validation/types.js";

// Import checks so they self-register
import "../../src/validation/checks/spec-chapters.js";

function makeCtx(overrides?: Partial<CheckContext>): CheckContext {
  return {
    spec: {
      meta: { title: "Test", resolution: { width: 1920, height: 1080 } },
      chapters: [{ title: "Ch1", steps: [{ action: "navigate", url: "http://localhost:3000" }] }],
      pacing: {},
    },
    specDir: "/tmp/test",
    ...overrides,
  };
}

describe("preflight", () => {
  it("resolves when all checks pass", async () => {
    await expect(preflight(makeCtx())).resolves.toBeUndefined();
  });

  it("throws PreflightError on check failures", async () => {
    const ctx = makeCtx({ spec: { meta: { title: "T" }, chapters: [], pacing: {} } });
    await expect(preflight(ctx)).rejects.toThrow(PreflightError);
  });

  it("PreflightError contains failures array", async () => {
    const ctx = makeCtx({ spec: { meta: { title: "T" }, chapters: [], pacing: {} } });
    try {
      await preflight(ctx);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PreflightError);
      expect((err as PreflightError).failures.length).toBeGreaterThan(0);
    }
  });

  it("PreflightError message includes check names", async () => {
    const ctx = makeCtx({ spec: { meta: { title: "T" }, chapters: [], pacing: {} } });
    try {
      await preflight(ctx);
    } catch (err) {
      expect((err as PreflightError).message).toContain("spec-chapters");
    }
  });

  it("PreflightError name is set correctly", () => {
    const err = new PreflightError([]);
    expect(err.name).toBe("PreflightError");
  });
});
