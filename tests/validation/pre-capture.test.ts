import { describe, it, expect, vi } from "vitest";
import { runPhase } from "../../src/validation/registry.js";
import type { CheckContext } from "../../src/validation/types.js";

// Import to trigger registration
import "../../src/validation/checks/pre-capture.js";

function makeCtx(opts?: Record<string, unknown>): CheckContext {
  return {
    spec: {
      meta: { title: "Test" },
      chapters: [{ title: "Ch1", steps: [{ action: "navigate", url: "http://localhost:3000" }] }],
    },
    specDir: "/tmp",
    options: { headless: true, ...opts },
  };
}

describe("pre-capture check", () => {
  it("returns results array", async () => {
    const results = await runPhase("pre-capture", makeCtx());
    expect(Array.isArray(results)).toBe(true);
  });

  it("checks for playwright availability", async () => {
    const results = await runPhase("pre-capture", makeCtx());
    const pwCheck = results.find(
      (r) => r.checkName === "playwright-installed" || r.checkName === "pre-capture",
    );
    expect(pwCheck).toBeDefined();
  });

  it("passes when playwright is installed", async () => {
    const results = await runPhase("pre-capture", makeCtx());
    const pwCheck = results.find((r) => r.checkName === "playwright-installed");
    if (pwCheck) {
      expect(pwCheck.status).toBe("pass");
    }
  });

  it("warns about headed mode", async () => {
    const results = await runPhase("pre-capture", makeCtx({ headless: false }));
    const headedWarn = results.find((r) => r.checkName === "pre-capture" && r.status === "warn");
    expect(headedWarn).toBeDefined();
    expect(headedWarn?.message).toContain("headed");
  });

  it("no headed warning when headless is true", async () => {
    const results = await runPhase("pre-capture", makeCtx({ headless: true }));
    const headedWarn = results.find((r) => r.message?.includes("headed") && r.status === "warn");
    expect(headedWarn).toBeUndefined();
  });

  it("all results have pre-capture phase", async () => {
    const results = await runPhase("pre-capture", makeCtx());
    for (const r of results) {
      expect(r.phase).toBe("pre-capture");
    }
  });

  it("results have checkName set", async () => {
    const results = await runPhase("pre-capture", makeCtx());
    for (const r of results) {
      expect(r.checkName).toBeTruthy();
    }
  });

  it("results have status set", async () => {
    const results = await runPhase("pre-capture", makeCtx());
    for (const r of results) {
      expect(["pass", "fail", "warn"]).toContain(r.status);
    }
  });

  it("results have message set", async () => {
    const results = await runPhase("pre-capture", makeCtx());
    for (const r of results) {
      expect(typeof r.message).toBe("string");
    }
  });

  it("no failures in normal environment", async () => {
    const results = await runPhase("pre-capture", makeCtx());
    const preCaptureResults = results.filter(
      (r) => r.checkName === "pre-capture" || r.checkName === "playwright-installed",
    );
    const failures = preCaptureResults.filter((r) => r.status === "fail");
    expect(failures).toHaveLength(0);
  });

  it("suggestion is a string or undefined", async () => {
    const results = await runPhase("pre-capture", makeCtx());
    for (const r of results) {
      if (r.suggestion !== undefined) {
        expect(typeof r.suggestion).toBe("string");
      }
    }
  });
});
