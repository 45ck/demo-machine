import { describe, it, expect } from "vitest";
import { runPhase } from "../../../src/validation/registry.js";
import type { CheckContext } from "../../../src/validation/types.js";

// Import to trigger registration
import "../../../src/validation/checks/spec-selectors.js";
import { KNOWN_ARIA_ROLES } from "../../../src/validation/checks/spec-selectors.js";

function makeCtx(chapters: unknown[]): CheckContext {
  return {
    spec: { meta: { title: "Test" }, chapters },
    specDir: "/tmp",
  };
}

function selectorResults(chapters: unknown[]) {
  return runPhase("pre-capture", makeCtx(chapters)).then((all) =>
    all.filter((r) => r.checkName === "spec-selectors"),
  );
}

describe("spec-selectors check", () => {
  it("passes with valid CSS selectors", async () => {
    const results = await selectorResults([
      { title: "Ch1", steps: [{ action: "click", selector: "#submit-btn" }] },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("pass");
  });

  it("fails on selector with curly braces", async () => {
    const results = await selectorResults([
      { title: "Ch1", steps: [{ action: "click", selector: "div{color:red}" }] },
    ]);
    expect(results.some((r) => r.status === "fail")).toBe(true);
    expect(results.some((r) => r.message.includes("CSS block delimiters"))).toBe(true);
  });

  it("fails on selector starting with digit", async () => {
    const results = await selectorResults([
      { title: "Ch1", steps: [{ action: "click", selector: "123abc" }] },
    ]);
    expect(results.some((r) => r.status === "fail")).toBe(true);
    expect(results.some((r) => r.message.includes("digit"))).toBe(true);
  });

  it("fails on empty selector", async () => {
    const results = await selectorResults([
      { title: "Ch1", steps: [{ action: "click", selector: "   " }] },
    ]);
    expect(results.some((r) => r.status === "fail")).toBe(true);
  });

  it("warns on unknown ARIA role", async () => {
    const results = await selectorResults([
      {
        title: "Ch1",
        steps: [{ action: "click", target: { by: "role", role: "nonexistent-role" } }],
      },
    ]);
    expect(results.some((r) => r.status === "warn")).toBe(true);
    expect(results.some((r) => r.message.includes("nonexistent-role"))).toBe(true);
  });

  it("passes with known ARIA role", async () => {
    const results = await selectorResults([
      {
        title: "Ch1",
        steps: [{ action: "click", target: { by: "role", role: "button" } }],
      },
    ]);
    expect(results.every((r) => r.status !== "warn" || !r.message.includes("ARIA role"))).toBe(
      true,
    );
  });

  it("validates dragAndDrop from/to selectors", async () => {
    const results = await selectorResults([
      {
        title: "Ch1",
        steps: [
          {
            action: "dragAndDrop",
            from: { selector: "div{bad}" },
            to: { selector: "#good" },
          },
        ],
      },
    ]);
    expect(results.some((r) => r.status === "fail")).toBe(true);
    expect(results.some((r) => r.message.includes("dragAndDrop.from"))).toBe(true);
  });

  it("validates dragAndDrop to selector", async () => {
    const results = await selectorResults([
      {
        title: "Ch1",
        steps: [
          {
            action: "dragAndDrop",
            from: { selector: "#ok" },
            to: { selector: "123bad" },
          },
        ],
      },
    ]);
    expect(results.some((r) => r.status === "fail")).toBe(true);
    expect(results.some((r) => r.message.includes("dragAndDrop.to"))).toBe(true);
  });

  it("passes with no selectors", async () => {
    const results = await selectorResults([
      { title: "Ch1", steps: [{ action: "wait", timeout: 1000 }] },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("pass");
  });

  it("includes step index in error message", async () => {
    const results = await selectorResults([
      {
        title: "Ch1",
        steps: [
          { action: "click", selector: "#ok" },
          { action: "click", selector: "2bad" },
        ],
      },
    ]);
    expect(results.some((r) => r.message.includes("Step 1"))).toBe(true);
  });

  it("KNOWN_ARIA_ROLES includes contentinfo", () => {
    expect(KNOWN_ARIA_ROLES.has("contentinfo")).toBe(true);
  });

  it("KNOWN_ARIA_ROLES includes menuitemcheckbox", () => {
    expect(KNOWN_ARIA_ROLES.has("menuitemcheckbox")).toBe(true);
  });

  it("KNOWN_ARIA_ROLES includes treegrid", () => {
    expect(KNOWN_ARIA_ROLES.has("treegrid")).toBe(true);
  });
});
