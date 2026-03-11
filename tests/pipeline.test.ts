import { describe, it, expect } from "vitest";
import { extractBranding } from "../src/pipeline.js";
import type { PipelineOptions } from "../src/pipeline.js";
import type { DemoSpec } from "../src/spec/types.js";

function makeSpec(branding?: DemoSpec["meta"]["branding"]): DemoSpec {
  return {
    meta: {
      title: "Test",
      resolution: { width: 1920, height: 1080 },
      branding,
    },
    chapters: [
      {
        title: "Ch1",
        steps: [{ action: "wait", timeout: 100 }],
      },
    ],
  } as DemoSpec;
}

describe("PipelineOptions.specDir", () => {
  it("accepts explicit specDir for upload path resolution", () => {
    // Compile-time check: PipelineOptions must accept specDir.
    // This test will fail to compile if specDir is removed from the interface.
    const opts: PipelineOptions = {
      output: "/tmp/out",
      narration: false,
      edit: false,
      renderer: "ffmpeg",
      ttsProvider: "kokoro",
      headless: true,
      specDir: "/custom/spec/dir",
    };
    expect(opts.specDir).toBe("/custom/spec/dir");
  });

  it("allows specDir to be omitted (derived from specPath automatically)", () => {
    const opts: PipelineOptions = {
      output: "/tmp/out",
      narration: false,
      edit: false,
      renderer: "ffmpeg",
      ttsProvider: "kokoro",
      headless: true,
    };
    expect(opts.specDir).toBeUndefined();
  });
});

describe("extractBranding", () => {
  it("returns undefined when no branding", () => {
    const spec = makeSpec(undefined);
    expect(extractBranding(spec)).toBeUndefined();
  });

  it("returns logo when branding has logo", () => {
    const spec = makeSpec({ logo: "./logo.png" });
    expect(extractBranding(spec)).toEqual({ logo: "./logo.png" });
  });

  it("returns colors when branding has both primary and background", () => {
    const spec = makeSpec({
      colors: { primary: "#111", background: "#222" },
    });
    expect(extractBranding(spec)).toEqual({
      colors: { primary: "#111", background: "#222" },
    });
  });

  it("returns logo and colors together", () => {
    const spec = makeSpec({
      logo: "./logo.png",
      colors: { primary: "#111", background: "#222" },
    });
    expect(extractBranding(spec)).toEqual({
      logo: "./logo.png",
      colors: { primary: "#111", background: "#222" },
    });
  });

  it("omits colors when primary is missing", () => {
    const spec = makeSpec({
      colors: { background: "#222" },
    } as DemoSpec["meta"]["branding"]);
    const result = extractBranding(spec);
    expect(result).toBeDefined();
    expect(result?.colors).toBeUndefined();
  });

  it("omits colors when background is missing", () => {
    const spec = makeSpec({
      colors: { primary: "#111" },
    } as DemoSpec["meta"]["branding"]);
    const result = extractBranding(spec);
    expect(result).toBeDefined();
    expect(result?.colors).toBeUndefined();
  });
});
