import { describe, it, expect } from "vitest";
import { runPhase } from "../../../src/validation/registry.js";
import type { CheckContext } from "../../../src/validation/types.js";

// Import to trigger registration
import "../../../src/validation/checks/spec-steps.js";
import { KNOWN_ACTIONS } from "../../../src/validation/checks/spec-steps.js";

function makeCtx(spec: unknown): CheckContext {
  return { spec, specDir: "/tmp" };
}

function stepsResults(spec: unknown) {
  return runPhase("pre-capture", makeCtx(spec)).then((all) =>
    all.filter((r) => r.checkName === "spec-steps"),
  );
}

describe("spec-steps check", () => {
  it("passes with all known actions", async () => {
    const results = await stepsResults({
      meta: { title: "T" },
      chapters: [
        {
          title: "C",
          steps: [
            { action: "navigate", url: "http://localhost:3000" },
            { action: "click", selector: "#x" },
          ],
        },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("pass");
  });

  it("fails on unknown action", async () => {
    const results = await stepsResults({
      meta: { title: "T" },
      chapters: [{ title: "C", steps: [{ action: "flyToMoon" }] }],
    });
    expect(results.some((r) => r.status === "fail")).toBe(true);
    expect(results.some((r) => r.message.includes("flyToMoon"))).toBe(true);
  });

  it("includes suggestion with known actions list", async () => {
    const results = await stepsResults({
      meta: { title: "T" },
      chapters: [{ title: "C", steps: [{ action: "unknown" }] }],
    });
    const failResult = results.find((r) => r.status === "fail");
    expect(failResult?.suggestion).toContain("navigate");
  });

  it("warns when no navigate step and no runner.url", async () => {
    const results = await stepsResults({
      meta: { title: "T" },
      chapters: [{ title: "C", steps: [{ action: "click", selector: "#x" }] }],
    });
    expect(results.some((r) => r.status === "warn" && r.message.includes("No navigate"))).toBe(
      true,
    );
  });

  it("no navigate warning when runner.url is set", async () => {
    const results = await stepsResults({
      meta: { title: "T" },
      runner: { url: "http://localhost:3000" },
      chapters: [{ title: "C", steps: [{ action: "click", selector: "#x" }] }],
    });
    const navWarn = results.find((r) => r.message?.includes("No navigate"));
    expect(navWarn).toBeUndefined();
  });

  it("no navigate warning when navigate step exists", async () => {
    const results = await stepsResults({
      meta: { title: "T" },
      chapters: [
        {
          title: "C",
          steps: [{ action: "navigate", url: "http://localhost:3000" }],
        },
      ],
    });
    const navWarn = results.find((r) => r.message?.includes("No navigate"));
    expect(navWarn).toBeUndefined();
  });

  it("warns on very high assert timeout", async () => {
    const results = await stepsResults({
      meta: { title: "T" },
      chapters: [
        {
          title: "C",
          steps: [
            { action: "navigate", url: "http://localhost:3000" },
            { action: "assert", selector: "#x", visible: true, timeoutMs: 60000 },
          ],
        },
      ],
    });
    expect(results.some((r) => r.status === "warn" && r.message.includes("60000ms"))).toBe(true);
  });

  it("warns on very long wait timeout", async () => {
    const results = await stepsResults({
      meta: { title: "T" },
      chapters: [
        {
          title: "C",
          steps: [
            { action: "navigate", url: "http://localhost:3000" },
            { action: "wait", timeout: 60000 },
          ],
        },
      ],
    });
    expect(results.some((r) => r.status === "warn" && r.message.includes("60000ms"))).toBe(true);
  });

  it("warns on very high waitForLocalFile timeout", async () => {
    const results = await stepsResults({
      meta: { title: "T" },
      chapters: [
        {
          title: "C",
          steps: [
            { action: "navigate", url: "http://localhost:3000" },
            { action: "waitForLocalFile", path: "./generated.txt", timeoutMs: 60000 },
          ],
        },
      ],
    });
    expect(results.some((r) => r.status === "warn" && r.message.includes("60000ms"))).toBe(true);
  });

  it("KNOWN_ACTIONS includes all expected actions", () => {
    const expected = [
      "navigate",
      "click",
      "clickFirstVisible",
      "type",
      "hover",
      "scroll",
      "wait",
      "waitForLocalDirectoryStable",
      "waitForLocalFile",
      "waitForPageFunction",
      "evaluate",
      "runCommand",
      "assert",
      "screenshot",
      "press",
      "back",
      "forward",
      "check",
      "uncheck",
      "select",
      "selectFirstNonPlaceholder",
      "upload",
      "dragAndDrop",
    ];
    for (const action of expected) {
      expect(KNOWN_ACTIONS.has(action)).toBe(true);
    }
  });

  it("includes step index in error", async () => {
    const results = await stepsResults({
      meta: { title: "T" },
      chapters: [
        {
          title: "C",
          steps: [{ action: "navigate", url: "http://localhost:3000" }, { action: "badAction" }],
        },
      ],
    });
    expect(results.some((r) => r.message.includes("Step 1"))).toBe(true);
  });

  it("does not warn on normal assert timeout", async () => {
    const results = await stepsResults({
      meta: { title: "T" },
      chapters: [
        {
          title: "C",
          steps: [
            { action: "navigate", url: "http://localhost:3000" },
            { action: "assert", selector: "#x", visible: true, timeoutMs: 5000 },
          ],
        },
      ],
    });
    const assertWarn = results.find((r) => r.message?.includes("assert timeout"));
    expect(assertWarn).toBeUndefined();
  });

  it("does not warn on normal wait timeout", async () => {
    const results = await stepsResults({
      meta: { title: "T" },
      chapters: [
        {
          title: "C",
          steps: [
            { action: "navigate", url: "http://localhost:3000" },
            { action: "wait", timeout: 2000 },
          ],
        },
      ],
    });
    const waitWarn = results.find((r) => r.message?.includes("wait timeout"));
    expect(waitWarn).toBeUndefined();
  });

  it("multiple unknown actions produce multiple failures", async () => {
    const results = await stepsResults({
      meta: { title: "T" },
      chapters: [
        {
          title: "C",
          steps: [
            { action: "navigate", url: "http://localhost:3000" },
            { action: "foo" },
            { action: "bar" },
          ],
        },
      ],
    });
    const failures = results.filter((r) => r.status === "fail");
    expect(failures.length).toBe(2);
  });

  it("handles chapters with mixed valid and invalid steps", async () => {
    const results = await stepsResults({
      meta: { title: "T" },
      chapters: [
        { title: "C1", steps: [{ action: "navigate", url: "http://localhost:3000" }] },
        { title: "C2", steps: [{ action: "invalidStep" }] },
      ],
    });
    expect(results.some((r) => r.status === "fail")).toBe(true);
  });

  it("handles spec with selectFirstNonPlaceholder action", async () => {
    const results = await stepsResults({
      meta: { title: "T" },
      chapters: [
        {
          title: "C",
          steps: [
            { action: "navigate", url: "http://localhost:3000" },
            { action: "selectFirstNonPlaceholder", selector: "#dropdown" },
          ],
        },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("pass");
  });
});
