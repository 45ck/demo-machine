import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import type { QualityCheckContext } from "../../../src/quality/types.js";
import { checkAssertZeroEffect } from "../../../src/quality/checks/visual/assert-zero-effect.js";

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

function pngWithSingleChangedPixel(): { before: Buffer; after: Buffer } {
  const before = new PNG({ width: 10, height: 10 });
  const after = new PNG({ width: 10, height: 10 });
  for (let i = 0; i < 100; i++) {
    const offset = i * 4;
    before.data[offset] = 128;
    before.data[offset + 1] = 128;
    before.data[offset + 2] = 128;
    before.data[offset + 3] = 255;
    after.data[offset] = 128;
    after.data[offset + 1] = 128;
    after.data[offset + 2] = 128;
    after.data[offset + 3] = 255;
  }
  after.data[0] = 255;
  return { before: PNG.sync.write(before), after: PNG.sync.write(after) };
}

function baseCtx(overrides?: Partial<QualityCheckContext>): QualityCheckContext {
  return {
    outputMp4Path: "/out/output.mp4",
    spec: { meta: { resolution: { width: 10, height: 10 } } },
    ...overrides,
  };
}

describe("checkAssertZeroEffect", () => {
  it("warns when no assert screenshot pairs are provided", () => {
    const results = checkAssertZeroEffect(baseCtx());
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
    expect(results[0]!.message).toContain("skipped");
  });

  it("warns when assertScreenshotPairs is empty array", () => {
    const results = checkAssertZeroEffect(baseCtx({ assertScreenshotPairs: [] }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
  });

  it("passes when before and after screenshots are identical", () => {
    const img = solidPng(10, 10, 128, 128, 128);
    const pairs = [{ stepIndex: 3, before: img, after: img }];
    const results = checkAssertZeroEffect(baseCtx({ assertScreenshotPairs: pairs }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("fails when before and after differ (phantom overlay detected)", () => {
    const before = solidPng(10, 10, 128, 128, 128);
    const after = solidPng(10, 10, 255, 255, 255);
    const pairs = [{ stepIndex: 5, before, after }];
    const results = checkAssertZeroEffect(baseCtx({ assertScreenshotPairs: pairs }));
    const fail = results.find((r) => r.status === "fail");
    expect(fail).toBeDefined();
    expect(fail!.message).toContain("step 5");
    expect(fail!.message).toContain("pixels changed");
  });

  it("warns on a small assert visual effect", () => {
    const { before, after } = pngWithSingleChangedPixel();
    const pairs = [{ stepIndex: 6, before, after }];

    const results = checkAssertZeroEffect(baseCtx({ assertScreenshotPairs: pairs }));

    const warn = results.find((r) => r.status === "warn");
    expect(warn).toBeDefined();
    expect(warn!.message).toContain("1 pixels changed");
  });

  it("reports each failing assert step separately", () => {
    const gray = solidPng(10, 10, 128, 128, 128);
    const white = solidPng(10, 10, 255, 255, 255);
    const pairs = [
      { stepIndex: 1, before: gray, after: white },
      { stepIndex: 4, before: gray, after: gray },
      { stepIndex: 7, before: gray, after: white },
    ];
    const results = checkAssertZeroEffect(baseCtx({ assertScreenshotPairs: pairs }));
    const fails = results.filter((r) => r.status === "fail");
    expect(fails).toHaveLength(2);
    expect(fails[0]!.message).toContain("step 1");
    expect(fails[1]!.message).toContain("step 7");
  });

  it("includes suggestion about pulseFocus/flashSpotlight", () => {
    const before = solidPng(10, 10, 128, 128, 128);
    const after = solidPng(10, 10, 255, 255, 255);
    const pairs = [{ stepIndex: 0, before, after }];
    const results = checkAssertZeroEffect(baseCtx({ assertScreenshotPairs: pairs }));
    const fail = results.find((r) => r.status === "fail");
    expect(fail!.suggestion).toContain("pulseFocus");
  });

  it("all results have phase post-render", () => {
    const img = solidPng(10, 10, 128, 128, 128);
    const pairs = [{ stepIndex: 0, before: img, after: img }];
    const results = checkAssertZeroEffect(baseCtx({ assertScreenshotPairs: pairs }));
    for (const r of results) {
      expect(r.phase).toBe("post-render");
    }
  });
});
