import { describe, it, expect } from "vitest";
import { createRenderer } from "../../src/editor/renderer.js";
import { FfmpegRenderer } from "../../src/editor/renderers/ffmpeg.js";

describe("createRenderer", () => {
  it('returns FfmpegRenderer for "ffmpeg"', () => {
    const renderer = createRenderer("ffmpeg");
    expect(renderer).toBeInstanceOf(FfmpegRenderer);
    expect(renderer.name).toBe("ffmpeg");
  });

  it("throws for unknown renderer name", () => {
    expect(() => createRenderer("unknown")).toThrow('Unknown renderer: "unknown"');
  });

  it("throws for empty string", () => {
    expect(() => createRenderer("")).toThrow('Unknown renderer: ""');
  });

  it("error message lists supported renderers", () => {
    expect(() => createRenderer("canvas")).toThrow('Supported: "ffmpeg"');
  });
});
