import { describe, it, expect } from "vitest";
import { demoSpecSchema } from "../../src/spec/schema.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Minimal valid spec object (navigate is the simplest step). */
function minimalSpec() {
  return {
    meta: { title: "T" },
    runner: { url: "http://localhost:3000" },
    chapters: [
      {
        title: "Ch1",
        steps: [{ action: "navigate", url: "/" }],
      },
    ],
  };
}

/** Fully-loaded spec with every optional field populated. */
function fullSpec() {
  return {
    meta: {
      title: "Full Demo",
      resolution: { width: 2560, height: 1440 },
      branding: {
        logo: "./logo.png",
        colors: { primary: "#FF0000", background: "#000" },
      },
    },
    runner: {
      command: "pnpm dev",
      url: "http://localhost:3000",
      healthcheck: "http://localhost:3000/health",
      timeout: 60000,
    },
    redaction: {
      selectors: [".secret"],
      secrets: ["password"],
    },
    narration: {
      enabled: true,
      provider: "kokoro",
      voice: "af_heart",
      sync: { mode: "auto-sync", bufferMs: 500 },
    },
    chapters: [
      {
        title: "Chapter One",
        narration: "Intro narration.",
        steps: [
          { action: "navigate", url: "/", narration: "Go home" },
          { action: "click", selector: "#btn", narration: "Click it" },
          {
            action: "type",
            selector: "#input",
            text: "hello",
            narration: "Type text",
          },
          { action: "hover", selector: "#el", narration: "Hover" },
          { action: "scroll", selector: "#list", x: 0, y: 200, narration: "Scroll down" },
          { action: "wait", timeout: 500, narration: "Pause" },
          {
            action: "assert",
            selector: ".msg",
            visible: true,
            text: "OK",
            narration: "Check",
          },
          { action: "screenshot", name: "final", narration: "Capture" },
          { action: "press", key: "Enter", narration: "Submit" },
        ],
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe("demoSpecSchema", () => {
  /* ---------- Happy-path ------------------------------------------ */

  it("parses a valid complete spec", () => {
    const result = demoSpecSchema.safeParse(fullSpec());
    expect(result.success).toBe(true);
  });

  it("parses the minimum valid spec", () => {
    const result = demoSpecSchema.safeParse(minimalSpec());
    expect(result.success).toBe(true);
  });

  /* ---------- Defaults -------------------------------------------- */

  it("applies default resolution 1920x1080", () => {
    const result = demoSpecSchema.parse(minimalSpec());
    expect(result.meta.resolution).toEqual({ width: 1920, height: 1080 });
  });

  it("applies default runner timeout 30000", () => {
    const result = demoSpecSchema.parse(minimalSpec());
    expect(result.runner.timeout).toBe(30000);
  });

  it("applies default scroll x=0, y=0", () => {
    const spec = minimalSpec();
    spec.chapters[0]!.steps = [{ action: "scroll" as const }];
    const result = demoSpecSchema.parse(spec);
    const step = result.chapters[0]!.steps[0]!;
    expect(step).toMatchObject({ action: "scroll", x: 0, y: 0 });
  });

  /* ---------- Each action type validates -------------------------- */

  describe("action types", () => {
    const cases: Array<{ action: string; step: Record<string, unknown> }> = [
      { action: "navigate", step: { action: "navigate", url: "/home" } },
      { action: "click", step: { action: "click", selector: "#btn" } },
      {
        action: "type",
        step: { action: "type", selector: "#in", text: "hi" },
      },
      { action: "hover", step: { action: "hover", selector: ".el" } },
      { action: "scroll", step: { action: "scroll" } },
      { action: "wait", step: { action: "wait", timeout: 100 } },
      {
        action: "assert",
        step: { action: "assert", selector: ".x", visible: true },
      },
      { action: "screenshot", step: { action: "screenshot" } },
      { action: "press", step: { action: "press", key: "Escape" } },
    ];

    for (const { action, step } of cases) {
      it(`validates "${action}" step`, () => {
        const spec = minimalSpec();
        spec.chapters[0]!.steps = [step as never];
        const result = demoSpecSchema.safeParse(spec);
        expect(result.success).toBe(true);
      });
    }
  });

  /* ---------- Optional fields ------------------------------------- */

  describe("optional fields", () => {
    it("branding can be omitted", () => {
      const spec = minimalSpec();
      const result = demoSpecSchema.parse(spec);
      expect(result.meta.branding).toBeUndefined();
    });

    it("redaction can be omitted", () => {
      const spec = minimalSpec();
      const result = demoSpecSchema.parse(spec);
      expect(result.redaction).toBeUndefined();
    });

    it("narration can be omitted from chapters and steps", () => {
      const spec = minimalSpec();
      const result = demoSpecSchema.parse(spec);
      expect(result.chapters[0]!.narration).toBeUndefined();
    });

    it("runner command and healthcheck are optional", () => {
      const spec = minimalSpec();
      const result = demoSpecSchema.parse(spec);
      expect(result.runner.command).toBeUndefined();
      expect(result.runner.healthcheck).toBeUndefined();
    });

    it("screenshot name is optional", () => {
      const spec = minimalSpec();
      spec.chapters[0]!.steps = [{ action: "screenshot" as const }];
      const result = demoSpecSchema.parse(spec);
      const step = result.chapters[0]!.steps[0]!;
      expect(step.action).toBe("screenshot");
    });
  });

  /* ---------- Invalid specs --------------------------------------- */

  describe("invalid specs", () => {
    it("rejects missing title", () => {
      const spec = minimalSpec();
      (spec.meta as Record<string, unknown>).title = undefined;
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it("rejects empty title", () => {
      const spec = minimalSpec();
      spec.meta.title = "";
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it("rejects empty chapters array", () => {
      const spec = minimalSpec();
      spec.chapters = [];
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it("rejects chapter with empty steps", () => {
      const spec = minimalSpec();
      spec.chapters[0]!.steps = [];
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it("rejects invalid runner URL", () => {
      const spec = minimalSpec();
      spec.runner.url = "not-a-url";
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it("rejects invalid healthcheck URL", () => {
      const spec = {
        ...minimalSpec(),
        runner: {
          url: "http://localhost:3000",
          healthcheck: "bad-url",
        },
      };
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it("rejects negative resolution width", () => {
      const spec = minimalSpec();
      spec.meta.resolution = { width: -1, height: 1080 };
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it("rejects non-integer resolution height", () => {
      const spec = minimalSpec();
      spec.meta.resolution = { width: 1920, height: 10.5 };
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it("rejects negative runner timeout", () => {
      const spec = minimalSpec();
      (spec.runner as Record<string, unknown>).timeout = -1;
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it("rejects wait step with non-positive timeout", () => {
      const spec = minimalSpec();
      spec.chapters[0]!.steps = [{ action: "wait" as const, timeout: 0 }];
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it("rejects invalid narration sync mode", () => {
      const spec = minimalSpec() as Record<string, unknown>;
      spec["narration"] = { enabled: true, sync: { mode: "fast" } };
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it("rejects missing runner.url", () => {
      const spec = minimalSpec();
      (spec.runner as Record<string, unknown>).url = undefined;
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it("rejects missing chapter title", () => {
      const spec = minimalSpec();
      (spec.chapters[0] as Record<string, unknown>).title = undefined;
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });
  });

  /* ---------- Discriminated union --------------------------------- */

  describe("discriminated union", () => {
    it("rejects unknown action types", () => {
      const spec = minimalSpec();
      spec.chapters[0]!.steps = [{ action: "dance", selector: "#party" } as never];
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it("rejects click step missing required selector", () => {
      const spec = minimalSpec();
      spec.chapters[0]!.steps = [{ action: "click" } as never];
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it("accepts click step with target instead of selector", () => {
      const spec = minimalSpec();
      spec.chapters[0]!.steps = [
        { action: "click" as const, target: { by: "role", role: "button", name: "Save" } },
      ];
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(true);
    });

    it("rejects type step missing required text", () => {
      const spec = minimalSpec();
      spec.chapters[0]!.steps = [{ action: "type", selector: "#in" } as never];
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it("rejects press step missing required key", () => {
      const spec = minimalSpec();
      spec.chapters[0]!.steps = [{ action: "press" } as never];
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it("rejects wait step missing required timeout", () => {
      const spec = minimalSpec();
      spec.chapters[0]!.steps = [{ action: "wait" } as never];
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });
  });

  /* ---------- Pacing ---------------------------------------------- */

  describe("pacing", () => {
    it("applies default pacing when not specified", () => {
      const result = demoSpecSchema.parse(minimalSpec());
      expect(result.pacing).toBeDefined();
      expect(result.pacing.cursorDurationMs).toBe(600);
      expect(result.pacing.typeDelayMs).toBe(50);
      expect(result.pacing.postClickDelayMs).toBe(500);
      expect(result.pacing.postTypeDelayMs).toBe(300);
      expect(result.pacing.postNavigateDelayMs).toBe(1000);
      expect(result.pacing.settleDelayMs).toBe(200);
    });

    it("allows overriding individual pacing values", () => {
      const spec = { ...minimalSpec(), pacing: { cursorDurationMs: 300 } };
      const result = demoSpecSchema.parse(spec);
      expect(result.pacing.cursorDurationMs).toBe(300);
      expect(result.pacing.typeDelayMs).toBe(50);
    });

    it("allows overriding all pacing values", () => {
      const spec = {
        ...minimalSpec(),
        pacing: {
          cursorDurationMs: 100,
          typeDelayMs: 20,
          postClickDelayMs: 200,
          postTypeDelayMs: 100,
          postNavigateDelayMs: 500,
          settleDelayMs: 50,
        },
      };
      const result = demoSpecSchema.parse(spec);
      expect(result.pacing.cursorDurationMs).toBe(100);
      expect(result.pacing.settleDelayMs).toBe(50);
    });
  });

  /* ---------- Per-step delay -------------------------------------- */

  describe("per-step delay", () => {
    it("accepts delay on click step", () => {
      const spec = minimalSpec();
      spec.chapters[0]!.steps = [{ action: "click" as const, selector: "#btn", delay: 100 }];
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(true);
    });

    it("accepts delay on type step", () => {
      const spec = minimalSpec();
      spec.chapters[0]!.steps = [
        { action: "type" as const, selector: "#in", text: "hi", delay: 200 },
      ];
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(true);
    });

    it("accepts delay on hover step", () => {
      const spec = minimalSpec();
      spec.chapters[0]!.steps = [{ action: "hover" as const, selector: "#el", delay: 150 }];
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(true);
    });

    it("accepts delay on press step", () => {
      const spec = minimalSpec();
      spec.chapters[0]!.steps = [{ action: "press" as const, key: "Enter", delay: 50 }];
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(true);
    });

    it("accepts delay on scroll step", () => {
      const spec = minimalSpec();
      spec.chapters[0]!.steps = [{ action: "scroll" as const, delay: 300 }];
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(true);
    });

    it("rejects non-positive delay", () => {
      const spec = minimalSpec();
      spec.chapters[0]!.steps = [{ action: "click" as const, selector: "#btn", delay: 0 } as never];
      const result = demoSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });
  });

  /* ---------- Maximum complexity ---------------------------------- */

  it("handles a spec with multiple chapters and many steps", () => {
    const spec = fullSpec();
    spec.chapters.push({
      title: "Chapter Two",
      steps: [
        { action: "navigate", url: "/page2" },
        { action: "screenshot", name: "page2" },
      ],
    });
    const result = demoSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.chapters).toHaveLength(2);
      expect(result.data.chapters[0]!.steps).toHaveLength(9);
    }
  });
});
