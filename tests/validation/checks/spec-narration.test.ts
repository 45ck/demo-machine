import { describe, it, expect } from "vitest";
import { runPhase } from "../../../src/validation/registry.js";
import type { CheckContext } from "../../../src/validation/types.js";

// Import to trigger registration
import "../../../src/validation/checks/spec-narration.js";

function makeCtx(spec: unknown, options?: Record<string, unknown>): CheckContext {
  return {
    spec,
    specDir: "/tmp",
    options: { narration: true, ...options },
  };
}

function narrationResults(spec: unknown, options?: Record<string, unknown>) {
  return runPhase("pre-capture", makeCtx(spec, options)).then((all) =>
    all.filter((r) => r.checkName === "spec-narration"),
  );
}

describe("spec-narration check", () => {
  it("passes when narration is disabled via options", async () => {
    const results = await narrationResults(
      {
        meta: { title: "T" },
        chapters: [{ title: "C", steps: [{ action: "click", selector: "#x" }] }],
      },
      { narration: false },
    );
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("pass");
  });

  it("warns when narration disabled in spec but enabled via CLI", async () => {
    const results = await narrationResults(
      {
        meta: { title: "T" },
        narration: { enabled: false },
        chapters: [{ title: "C", steps: [{ action: "click", selector: "#x" }] }],
      },
      { narration: true },
    );
    expect(results.some((r) => r.status === "warn")).toBe(true);
    expect(results.some((r) => r.message.includes("disabled in spec"))).toBe(true);
  });

  it("warns when no narration text in any step", async () => {
    const results = await narrationResults({
      meta: { title: "T" },
      chapters: [{ title: "C", steps: [{ action: "click", selector: "#x" }] }],
    });
    expect(
      results.some((r) => r.message.includes("no steps or chapters have narration text")),
    ).toBe(true);
  });

  it("passes when steps have narration text", async () => {
    const results = await narrationResults({
      meta: { title: "T" },
      chapters: [
        {
          title: "C",
          steps: [{ action: "click", selector: "#x", narration: "Click the button" }],
        },
      ],
    });
    const noTextWarn = results.find((r) => r.message?.includes("no steps or chapters"));
    expect(noTextWarn).toBeUndefined();
  });

  it("passes when chapter has narration text", async () => {
    const results = await narrationResults({
      meta: { title: "T" },
      chapters: [
        {
          title: "C",
          narration: "This chapter does things",
          steps: [{ action: "click", selector: "#x" }],
        },
      ],
    });
    const noTextWarn = results.find((r) => r.message?.includes("no steps or chapters"));
    expect(noTextWarn).toBeUndefined();
  });

  it("warns on unknown TTS provider", async () => {
    const results = await narrationResults(
      {
        meta: { title: "T" },
        narration: { provider: "unknown-provider" },
        chapters: [
          {
            title: "C",
            steps: [{ action: "click", selector: "#x", narration: "Click it" }],
          },
        ],
      },
      { narration: true },
    );
    expect(results.some((r) => r.message.includes("unknown-provider"))).toBe(true);
  });

  it("does not warn on known TTS provider", async () => {
    const results = await narrationResults(
      {
        meta: { title: "T" },
        narration: { provider: "kokoro" },
        chapters: [
          {
            title: "C",
            steps: [{ action: "click", selector: "#x", narration: "Click it" }],
          },
        ],
      },
      { narration: true },
    );
    const providerWarn = results.find((r) => r.message?.includes("Unknown TTS"));
    expect(providerWarn).toBeUndefined();
  });
});
