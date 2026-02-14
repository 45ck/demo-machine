import { describe, it, expect } from "vitest";
import { createRenderer, createRendererV2 } from "../../src/editor/renderer.js";
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

describe("createRendererV2", () => {
  it('returns FfmpegRendererAdapter for "ffmpeg"', async () => {
    const renderer = await createRendererV2("ffmpeg");
    expect(renderer.id).toBe("ffmpeg");
  });

  it("throws for unknown renderer id", async () => {
    await expect(createRendererV2("unknown")).rejects.toThrow('Unknown renderer: "unknown"');
  });

  it("error message lists supported renderers including remotion", async () => {
    await expect(createRendererV2("canvas")).rejects.toThrow('"ffmpeg", "remotion"');
  });

  it("ffmpeg renderer has a render function", async () => {
    const renderer = await createRendererV2("ffmpeg");
    expect(typeof renderer.render).toBe("function");
  });
});
