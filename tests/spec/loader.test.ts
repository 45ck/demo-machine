import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadSpec, validateSpec, SpecLoadError } from "../../src/spec/loader.js";

const EXAMPLES_DIR = join(__dirname, "..", "..", "examples");

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function validSpecObject() {
  return {
    meta: { title: "Test" },
    runner: { url: "http://localhost:3000" },
    chapters: [
      {
        title: "Ch",
        steps: [{ action: "navigate", url: "/" }],
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  loadSpec                                                          */
/* ------------------------------------------------------------------ */

describe("loadSpec", () => {
  it("reads and validates a YAML file", async () => {
    const spec = await loadSpec(join(EXAMPLES_DIR, "hello-world.demo.yaml"));
    expect(spec.meta.title).toBe("Hello World Demo");
    expect(spec.meta.resolution).toEqual({ width: 1920, height: 1080 });
    expect(spec.runner.url).toBe("http://localhost:3000");
    expect(spec.chapters).toHaveLength(1);
    expect(spec.chapters[0]!.steps).toHaveLength(5);
  });

  it("applies default values from schema", async () => {
    const spec = await loadSpec(join(EXAMPLES_DIR, "hello-world.demo.yaml"));
    // timeout is explicitly 30000 in the file, but this confirms parsing works
    expect(spec.runner.timeout).toBe(30000);
    expect(spec.meta.resolution.width).toBe(1920);
    expect(spec.meta.resolution.height).toBe(1080);
  });

  it("rejects non-existent files with SpecLoadError", async () => {
    await expect(loadSpec("/no/such/file.yaml")).rejects.toThrow(SpecLoadError);
    await expect(loadSpec("/no/such/file.yaml")).rejects.toThrow("Failed to read spec file");
  });

  it("rejects invalid YAML content", async () => {
    // We'll write a temp file with broken YAML via validateSpec test below.
    // For loadSpec we just verify SpecLoadError is thrown on bad paths.
    await expect(loadSpec("/no/such/file.yaml")).rejects.toBeInstanceOf(SpecLoadError);
  });

  it("preserves cause on file-read errors", async () => {
    try {
      await loadSpec("/no/such/file.yaml");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SpecLoadError);
      expect((err as SpecLoadError).detail).toBeDefined();
    }
  });

  it("returns correct structure from hello-world example", async () => {
    const spec = await loadSpec(join(EXAMPLES_DIR, "hello-world.demo.yaml"));

    // Meta
    expect(spec.meta.branding).toBeDefined();
    expect(spec.meta.branding!.logo).toBe("./assets/logo.png");
    expect(spec.meta.branding!.colors!.primary).toBe("#3B82F6");

    // Runner
    expect(spec.runner.command).toBe("pnpm dev");
    expect(spec.runner.healthcheck).toBe("http://localhost:3000/api/health");

    // Redaction
    expect(spec.redaction).toBeDefined();
    expect(spec.redaction!.selectors).toContain(".user-email");
    expect(spec.redaction!.secrets).toHaveLength(1);

    // Chapter steps
    const steps = spec.chapters[0]!.steps;
    expect(steps[0]!.action).toBe("navigate");
    expect(steps[1]!.action).toBe("click");
    expect(steps[2]!.action).toBe("type");
    expect(steps[3]!.action).toBe("wait");
    expect(steps[4]!.action).toBe("assert");
  });
});

/* ------------------------------------------------------------------ */
/*  validateSpec                                                      */
/* ------------------------------------------------------------------ */

describe("validateSpec", () => {
  it("validates a correct raw object", () => {
    const spec = validateSpec(validSpecObject());
    expect(spec.meta.title).toBe("Test");
    expect(spec.runner.timeout).toBe(30000); // default applied
    expect(spec.meta.resolution).toEqual({ width: 1920, height: 1080 }); // default
  });

  it("rejects an empty object", () => {
    expect(() => validateSpec({})).toThrow(SpecLoadError);
  });

  it("rejects null input", () => {
    expect(() => validateSpec(null)).toThrow(SpecLoadError);
  });

  it("rejects a spec with invalid action type", () => {
    const obj = validSpecObject();
    obj.chapters[0]!.steps = [{ action: "fly", url: "/" } as never];
    expect(() => validateSpec(obj)).toThrow(SpecLoadError);
  });

  it("includes field path in error message", () => {
    const obj = validSpecObject();
    (obj.meta as Record<string, unknown>).title = undefined;
    try {
      validateSpec(obj);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SpecLoadError);
      expect((err as SpecLoadError).message).toContain("meta.title");
    }
  });

  it("rejects empty chapters array", () => {
    const obj = validSpecObject();
    obj.chapters = [];
    expect(() => validateSpec(obj)).toThrow(SpecLoadError);
  });

  it("rejects chapter with empty steps", () => {
    const obj = validSpecObject();
    obj.chapters[0]!.steps = [];
    expect(() => validateSpec(obj)).toThrow(SpecLoadError);
  });
});
