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

function transparentPng(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  png.data.fill(0);
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

  it("fails when a step screenshot is blank white", () => {
    const screenshots = new Map<number, Buffer>();
    screenshots.set(0, solidPng(10, 10, 255, 255, 255));
    screenshots.set(1, solidPng(10, 10, 128, 128, 128));

    const results = checkStepScreenshots(baseCtx({ stepScreenshots: screenshots }));

    const fail = results.find((r) => r.status === "fail" && r.message.includes("blank"));
    expect(fail).toBeDefined();
    expect(fail!.message).toContain("Step 0");
  });

  it("fails when a step screenshot is fully transparent", () => {
    const screenshots = new Map<number, Buffer>();
    screenshots.set(0, transparentPng(10, 10));
    screenshots.set(1, solidPng(10, 10, 128, 128, 128));

    const results = checkStepScreenshots(baseCtx({ stepScreenshots: screenshots }));

    expect(results.some((r) => r.status === "fail" && r.message.includes("blank"))).toBe(true);
  });

  it("fails when screenshot dimensions do not match the expected viewport", () => {
    const screenshots = new Map<number, Buffer>();
    screenshots.set(0, solidPng(20, 10, 128, 128, 128));
    screenshots.set(1, solidPng(10, 10, 128, 128, 128));

    const results = checkStepScreenshots(baseCtx({ stepScreenshots: screenshots }));

    const fail = results.find((r) => r.status === "fail" && r.message.includes("20x10"));
    expect(fail).toBeDefined();
    expect(fail!.message).toContain("10x10");
  });

  it("fails when a screenshot artifact is not a readable PNG", () => {
    const screenshots = new Map<number, Buffer>();
    screenshots.set(0, Buffer.from("not a png"));
    screenshots.set(1, solidPng(10, 10, 128, 128, 128));

    const results = checkStepScreenshots(baseCtx({ stepScreenshots: screenshots }));

    expect(results.some((r) => r.status === "fail" && r.message.includes("readable PNG"))).toBe(
      true,
    );
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

  it("warns when consecutive screenshots differ catastrophically", () => {
    const gray = solidPng(10, 10, 128, 128, 128);
    const white = solidPng(10, 10, 255, 255, 255);
    const screenshots = new Map<number, Buffer>();
    screenshots.set(0, gray);
    screenshots.set(1, white);
    const results = checkStepScreenshots(baseCtx({ stepScreenshots: screenshots }));
    const warn = results.find((r) => r.status === "warn" && r.message.includes("pixel mismatch"));
    expect(warn).toBeDefined();
    expect(warn!.message).toContain("0→1");
    expect(warn!.message).toContain("pixel mismatch");
  });

  it("checks pairs in order by step index", () => {
    const a = solidPng(10, 10, 20, 20, 20);
    const b = solidPng(10, 10, 128, 128, 128);
    const c = solidPng(10, 10, 240, 240, 240);
    const screenshots = new Map<number, Buffer>();
    screenshots.set(5, a);
    screenshots.set(2, b);
    screenshots.set(10, c);
    const results = checkStepScreenshots(baseCtx({ stepScreenshots: screenshots }));
    const warnings = results.filter((r) => r.status === "warn");
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.some((warning) => warning.message.includes("2→5"))).toBe(true);
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
