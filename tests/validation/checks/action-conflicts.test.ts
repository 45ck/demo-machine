import { describe, it, expect } from "vitest";
import { runPhase } from "../../../src/validation/registry.js";
import type { CheckContext } from "../../../src/validation/types.js";

// Import to trigger registration
import "../../../src/validation/checks/action-conflicts.js";

function makeCtx(spec: unknown): CheckContext {
  return { spec, specDir: "/tmp" };
}

function conflictResults(spec: unknown) {
  return runPhase("pre-capture", makeCtx(spec)).then((all) =>
    all.filter((r) => r.checkName === "action-conflicts"),
  );
}

describe("action-conflicts check", () => {
  it("passes with no conflicts", async () => {
    const results = await conflictResults({
      chapters: [
        {
          title: "C",
          steps: [
            { action: "click", selector: "#btn-a" },
            { action: "type", selector: "#input", text: "hello" },
            { action: "assert", selector: "#input", visible: true },
            { action: "click", selector: "#btn-b" },
          ],
        },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("warns on navigate followed by type (potential stale page)", async () => {
    const results = await conflictResults({
      chapters: [
        {
          title: "C",
          steps: [
            { action: "navigate", url: "http://localhost:3000/page2" },
            { action: "type", selector: "#old-input", text: "hello" },
          ],
        },
      ],
    });
    expect(results.some((r) => r.status === "warn")).toBe(true);
    expect(results.some((r) => r.message.includes("navigate"))).toBe(true);
    expect(results.some((r) => r.message.includes("type"))).toBe(true);
  });

  it("warns on navigate followed by click", async () => {
    const results = await conflictResults({
      chapters: [
        {
          title: "C",
          steps: [
            { action: "navigate", url: "http://localhost:3000/page2" },
            { action: "click", selector: "#btn" },
          ],
        },
      ],
    });
    expect(results.some((r) => r.status === "warn" && r.message.includes("navigate"))).toBe(true);
  });

  it("warns on navigate followed by select", async () => {
    const results = await conflictResults({
      chapters: [
        {
          title: "C",
          steps: [
            { action: "navigate", url: "http://localhost:3000/page2" },
            { action: "select", selector: "#dropdown" },
          ],
        },
      ],
    });
    expect(results.some((r) => r.status === "warn" && r.message.includes("navigate"))).toBe(true);
  });

  it("warns on check then uncheck same selector without assertion", async () => {
    const results = await conflictResults({
      chapters: [
        {
          title: "C",
          steps: [
            { action: "navigate", url: "http://localhost:3000" },
            { action: "check", selector: "#agree" },
            { action: "uncheck", selector: "#agree" },
          ],
        },
      ],
    });
    expect(results.some((r) => r.status === "warn" && r.message.includes("check"))).toBe(true);
    expect(results.some((r) => r.message.includes("#agree"))).toBe(true);
  });

  it("warns on uncheck then check same selector without assertion", async () => {
    const results = await conflictResults({
      chapters: [
        {
          title: "C",
          steps: [
            { action: "navigate", url: "http://localhost:3000" },
            { action: "uncheck", selector: "#agree" },
            { action: "check", selector: "#agree" },
          ],
        },
      ],
    });
    expect(results.some((r) => r.status === "warn" && r.message.includes("check"))).toBe(true);
  });

  it("warns on duplicate select same selector", async () => {
    const results = await conflictResults({
      chapters: [
        {
          title: "C",
          steps: [
            { action: "navigate", url: "http://localhost:3000" },
            { action: "select", selector: "#dropdown" },
            { action: "select", selector: "#dropdown" },
          ],
        },
      ],
    });
    expect(results.some((r) => r.status === "warn" && r.message.includes("select"))).toBe(true);
    expect(results.some((r) => r.message.includes("#dropdown"))).toBe(true);
  });

  it("warns on duplicate type same selector", async () => {
    const results = await conflictResults({
      chapters: [
        {
          title: "C",
          steps: [
            { action: "navigate", url: "http://localhost:3000" },
            { action: "type", selector: "#input", text: "hello" },
            { action: "type", selector: "#input", text: "world" },
          ],
        },
      ],
    });
    expect(results.some((r) => r.status === "warn" && r.message.includes("type"))).toBe(true);
    expect(results.some((r) => r.message.includes("#input"))).toBe(true);
  });

  it("passes when assertion intervenes between conflicting actions", async () => {
    const results = await conflictResults({
      chapters: [
        {
          title: "C",
          steps: [
            { action: "check", selector: "#agree" },
            { action: "assert", selector: "#agree", checked: true },
            { action: "uncheck", selector: "#agree" },
          ],
        },
      ],
    });
    // Should pass — assert intervenes between check and uncheck
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("passes when selectors differ between consecutive same-action steps", async () => {
    const results = await conflictResults({
      chapters: [
        {
          title: "C",
          steps: [
            { action: "type", selector: "#input-a", text: "hello" },
            { action: "type", selector: "#input-b", text: "world" },
          ],
        },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("handles chapters with single step (no pairs to check)", async () => {
    const results = await conflictResults({
      chapters: [{ title: "C", steps: [{ action: "navigate", url: "http://localhost:3000" }] }],
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("handles empty chapters gracefully", async () => {
    const results = await conflictResults({
      chapters: [{ title: "C", steps: [] }],
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("handles spec with no chapters", async () => {
    const results = await conflictResults({});
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("includes step indices in warning message", async () => {
    const results = await conflictResults({
      chapters: [
        {
          title: "C",
          steps: [
            { action: "navigate", url: "http://localhost:3000" },
            { action: "type", selector: "#a", text: "x" },
            { action: "type", selector: "#a", text: "y" },
          ],
        },
      ],
    });
    const warning = results.find((r) => r.status === "warn");
    expect(warning).toBeDefined();
    // Should reference the step indices
    expect(warning!.message).toMatch(/step/i);
  });

  it("detects conflicts across multiple chapters", async () => {
    // Conflicts are within a chapter only — cross-chapter is fine
    // because navigate usually starts each chapter
    const results = await conflictResults({
      chapters: [
        {
          title: "C1",
          steps: [
            { action: "check", selector: "#agree" },
            { action: "uncheck", selector: "#agree" },
          ],
        },
        {
          title: "C2",
          steps: [
            { action: "select", selector: "#dd" },
            { action: "select", selector: "#dd" },
          ],
        },
      ],
    });
    const warnings = results.filter((r) => r.status === "warn");
    expect(warnings.length).toBe(2);
  });

  it("all results have phase pre-capture and checkName action-conflicts", async () => {
    const results = await conflictResults({
      chapters: [
        {
          title: "C",
          steps: [
            { action: "type", selector: "#a", text: "x" },
            { action: "type", selector: "#a", text: "y" },
          ],
        },
      ],
    });
    for (const r of results) {
      expect(r.phase).toBe("pre-capture");
      expect(r.checkName).toBe("action-conflicts");
    }
  });
});
