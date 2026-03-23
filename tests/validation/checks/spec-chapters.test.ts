import { describe, it, expect } from "vitest";
import { runPhase } from "../../../src/validation/registry.js";
import type { CheckContext } from "../../../src/validation/types.js";

// Import to trigger registration
import "../../../src/validation/checks/spec-chapters.js";

function makeCtx(chapters: unknown[]): CheckContext {
  return {
    spec: { meta: { title: "Test" }, chapters },
    specDir: "/tmp",
  };
}

function chapterResults(chapters: unknown[]) {
  return runPhase("pre-capture", makeCtx(chapters)).then((all) =>
    all.filter((r) => r.checkName === "spec-chapters"),
  );
}

describe("spec-chapters check", () => {
  it("passes with valid chapters", async () => {
    const results = await chapterResults([
      { title: "Ch1", steps: [{ action: "navigate", url: "http://localhost:3000" }] },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("pass");
  });

  it("fails when chapters array is empty", async () => {
    const results = await chapterResults([]);
    expect(results.some((r) => r.status === "fail")).toBe(true);
    expect(results.some((r) => r.message.includes("no chapters"))).toBe(true);
  });

  it("fails when a chapter has no steps", async () => {
    const results = await chapterResults([{ title: "Empty", steps: [] }]);
    expect(results.some((r) => r.status === "fail")).toBe(true);
    expect(results.some((r) => r.message.includes("no steps"))).toBe(true);
  });

  it("warns on duplicate chapter titles", async () => {
    const results = await chapterResults([
      { title: "Same", steps: [{ action: "click", selector: "#a" }] },
      { title: "Same", steps: [{ action: "click", selector: "#b" }] },
    ]);
    expect(results.some((r) => r.status === "warn")).toBe(true);
    expect(results.some((r) => r.message.includes("Duplicate"))).toBe(true);
  });

  it("warns when chapter count exceeds max", async () => {
    const chapters = Array.from({ length: 21 }, (_, i) => ({
      title: `Chapter ${i}`,
      steps: [{ action: "click", selector: `#btn-${i}` }],
    }));
    const results = await chapterResults(chapters);
    expect(results.some((r) => r.status === "warn" && r.message.includes("21 chapters"))).toBe(
      true,
    );
  });

  it("warns when step count exceeds max per chapter", async () => {
    const steps = Array.from({ length: 51 }, (_, i) => ({
      action: "click",
      selector: `#btn-${i}`,
    }));
    const results = await chapterResults([{ title: "Big", steps }]);
    expect(results.some((r) => r.status === "warn" && r.message.includes("51 steps"))).toBe(true);
  });

  it("does not warn at exactly 20 chapters", async () => {
    const chapters = Array.from({ length: 20 }, (_, i) => ({
      title: `Chapter ${i}`,
      steps: [{ action: "click", selector: `#btn-${i}` }],
    }));
    const results = await chapterResults(chapters);
    expect(results.every((r) => r.status === "pass")).toBe(true);
  });

  it("does not warn at exactly 50 steps", async () => {
    const steps = Array.from({ length: 50 }, (_, i) => ({
      action: "click",
      selector: `#btn-${i}`,
    }));
    const results = await chapterResults([{ title: "Big", steps }]);
    const stepWarn = results.filter((r) => r.message?.includes("steps (max"));
    expect(stepWarn).toHaveLength(0);
  });
});
