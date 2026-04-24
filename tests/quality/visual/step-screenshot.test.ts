import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import type { QualityCheckContext } from "../../../src/quality/types.js";
import { checkStepScreenshots } from "../../../src/quality/checks/visual/step-screenshot.js";

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

function baseCtx(overrides?: Partial<QualityCheckContext>): QualityCheckContext {
  return {
    outputMp4Path: "/out/output.mp4",
    spec: { meta: { resolution: { width: 10, height: 10 } } },
    ...overrides,
  };
}

describe("checkStepScreenshots", () => {
  it("warns when no step screenshots are provided", () => {
    const results = checkStepScreenshots(baseCtx());
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
    expect(results[0]!.message).toContain("skipped");
  });

  it("warns when only one screenshot is provided", () => {
    const screenshots = new Map<number, Buffer>();
    screenshots.set(0, solidPng(10, 10, 128, 128, 128));
    const results = checkStepScreenshots(baseCtx({ stepScreenshots: screenshots }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
  });

  it("passes when consecutive screenshots are identical", () => {
    const img = solidPng(10, 10, 128, 128, 128);
    const screenshots = new Map<number, Buffer>();
    screenshots.set(0, img);
    screenshots.set(1, img);
    screenshots.set(2, img);
    const results = checkStepScreenshots(baseCtx({ stepScreenshots: screenshots }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("warns when consecutive screenshots differ substantially but not catastrophically", () => {
    const gray = solidPng(10, 10, 128, 128, 128);
    const mixed = new PNG({ width: 10, height: 10 });
    for (let i = 0; i < 100; i++) {
      const offset = i * 4;
      const white = i < 50;
      mixed.data[offset] = white ? 255 : 128;
      mixed.data[offset + 1] = white ? 255 : 128;
      mixed.data[offset + 2] = white ? 255 : 128;
      mixed.data[offset + 3] = 255;
    }
    const screenshots = new Map<number, Buffer>();
    screenshots.set(0, gray);
    screenshots.set(1, PNG.sync.write(mixed));
    const results = checkStepScreenshots(baseCtx({ stepScreenshots: screenshots }));
    const warn = results.find((r) => r.status === "warn");
    expect(warn).toBeDefined();
    expect(warn!.message).toContain("0→1");
    expect(warn!.message).toContain("pixel mismatch");
  });

  it("fails when consecutive screenshots differ catastrophically", () => {
    const gray = solidPng(10, 10, 128, 128, 128);
    const white = solidPng(10, 10, 255, 255, 255);
    const screenshots = new Map<number, Buffer>();
    screenshots.set(0, gray);
    screenshots.set(1, white);
    const results = checkStepScreenshots(baseCtx({ stepScreenshots: screenshots }));
    const fail = results.find((r) => r.status === "fail");
    expect(fail).toBeDefined();
    expect(fail!.message).toContain("0→1");
    expect(fail!.message).toContain("pixel mismatch");
  });

  it("checks pairs in order by step index", () => {
    const a = solidPng(10, 10, 0, 0, 0);
    const b = solidPng(10, 10, 128, 128, 128);
    const c = solidPng(10, 10, 255, 255, 255);
    const screenshots = new Map<number, Buffer>();
    screenshots.set(5, a);
    screenshots.set(2, b);
    screenshots.set(10, c);
    const results = checkStepScreenshots(baseCtx({ stepScreenshots: screenshots }));
    // Should compare 2→5 and 5→10
    const fails = results.filter((r) => r.status === "fail");
    expect(fails.length).toBeGreaterThanOrEqual(1);
    expect(fails.some((f) => f.message.includes("2→5"))).toBe(true);
  });

  it("all results have phase post-render", () => {
    const img = solidPng(10, 10, 128, 128, 128);
    const screenshots = new Map<number, Buffer>();
    screenshots.set(0, img);
    screenshots.set(1, img);
    const results = checkStepScreenshots(baseCtx({ stepScreenshots: screenshots }));
    for (const r of results) {
      expect(r.phase).toBe("post-render");
    }
  });
});
