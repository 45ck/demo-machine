import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import type { QualityCheckContext } from "../../../src/quality/types.js";
import { checkPhantomOverlay } from "../../../src/quality/checks/visual/phantom-overlay.js";

/** Create a solid-color PNG buffer. */
function solidPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    png.data[offset] = r;
    png.data[offset + 1] = g;
    png.data[offset + 2] = b;
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png);
}

/** Create a PNG with some accent-colored pixels and the rest black. */
function pngWithAccentPixels(width: number, height: number, accentCount: number): Buffer {
  const png = new PNG({ width, height });
  const totalPixels = width * height;
  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    if (i < accentCount) {
      // Accent color #32dcff → RGB(50, 220, 255)
      png.data[offset] = 50;
      png.data[offset + 1] = 220;
      png.data[offset + 2] = 255;
    } else {
      png.data[offset] = 0;
      png.data[offset + 1] = 0;
      png.data[offset + 2] = 0;
    }
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png);
}

function baseCtx(overrides?: Partial<QualityCheckContext>): QualityCheckContext {
  return {
    outputMp4Path: "/out/output.mp4",
    spec: { meta: { resolution: { width: 10, height: 10 } } },
    ...overrides,
  };
}

describe("checkPhantomOverlay", () => {
  it("warns when no assert screenshot pairs are provided", () => {
    const results = checkPhantomOverlay(baseCtx());
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
    expect(results[0]!.message).toContain("skipped");
  });

  it("passes when after screenshot has no accent-colored pixels", () => {
    const black = solidPng(10, 10, 0, 0, 0);
    const pairs = [{ stepIndex: 0, before: black, after: black }];
    const results = checkPhantomOverlay(baseCtx({ assertScreenshotPairs: pairs }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("passes when accent pixel count is below threshold (<=10)", () => {
    const before = solidPng(10, 10, 0, 0, 0);
    const after = pngWithAccentPixels(10, 10, 5); // 5 accent pixels, below 10
    const pairs = [{ stepIndex: 0, before, after }];
    const results = checkPhantomOverlay(baseCtx({ assertScreenshotPairs: pairs }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("passes at the accent pixel threshold boundary", () => {
    const before = solidPng(10, 10, 0, 0, 0);
    const after = pngWithAccentPixels(10, 10, 10);
    const pairs = [{ stepIndex: 0, before, after }];

    const results = checkPhantomOverlay(baseCtx({ assertScreenshotPairs: pairs }));

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("fails when accent pixel count exceeds threshold", () => {
    const before = solidPng(10, 10, 0, 0, 0);
    const after = pngWithAccentPixels(10, 10, 50); // 50 accent pixels, exceeds 10
    const pairs = [{ stepIndex: 2, before, after }];
    const results = checkPhantomOverlay(baseCtx({ assertScreenshotPairs: pairs }));
    const fail = results.find((r) => r.status === "fail");
    expect(fail).toBeDefined();
    expect(fail!.message).toContain("step 2");
    expect(fail!.message).toContain("#32dcff");
    expect(fail!.message).toContain("50");
  });

  it("passes when accent-colored product pixels are stable across the assert", () => {
    const before = pngWithAccentPixels(10, 10, 50);
    const after = pngWithAccentPixels(10, 10, 50);
    const pairs = [{ stepIndex: 2, before, after }];

    const results = checkPhantomOverlay(baseCtx({ assertScreenshotPairs: pairs }));

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("reports each failing assert step separately", () => {
    const black = solidPng(10, 10, 0, 0, 0);
    const accent = pngWithAccentPixels(10, 10, 20);
    const pairs = [
      { stepIndex: 0, before: black, after: accent },
      { stepIndex: 1, before: black, after: black },
      { stepIndex: 2, before: black, after: accent },
    ];
    const results = checkPhantomOverlay(baseCtx({ assertScreenshotPairs: pairs }));
    const fails = results.filter((r) => r.status === "fail");
    expect(fails).toHaveLength(2);
  });

  it("includes suggestion about cursor overlay or focus ring", () => {
    const before = solidPng(10, 10, 0, 0, 0);
    const after = pngWithAccentPixels(10, 10, 20);
    const pairs = [{ stepIndex: 0, before, after }];
    const results = checkPhantomOverlay(baseCtx({ assertScreenshotPairs: pairs }));
    const fail = results.find((r) => r.status === "fail");
    expect(fail!.suggestion).toContain("cursor overlay");
  });

  it("detects near-accent colors within tolerance", () => {
    // Color (55, 225, 250) is within default tolerance of 15 from (50, 220, 255)
    const png = new PNG({ width: 10, height: 10 });
    for (let i = 0; i < 100; i++) {
      const offset = i * 4;
      png.data[offset] = 55;
      png.data[offset + 1] = 225;
      png.data[offset + 2] = 250;
      png.data[offset + 3] = 255;
    }
    const nearAccent = PNG.sync.write(png);
    const black = solidPng(10, 10, 0, 0, 0);
    const pairs = [{ stepIndex: 0, before: black, after: nearAccent }];
    const results = checkPhantomOverlay(baseCtx({ assertScreenshotPairs: pairs }));
    const fail = results.find((r) => r.status === "fail");
    expect(fail).toBeDefined();
  });

  it("all results have phase post-render", () => {
    const black = solidPng(10, 10, 0, 0, 0);
    const pairs = [{ stepIndex: 0, before: black, after: black }];
    const results = checkPhantomOverlay(baseCtx({ assertScreenshotPairs: pairs }));
    for (const r of results) {
      expect(r.phase).toBe("post-render");
    }
  });
});
