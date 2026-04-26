import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import type { QualityCheckContext } from "../../../src/quality/types.js";
import { checkChapterTitles } from "../../../src/quality/checks/visual/chapter-title.js";

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
    spec: {
      meta: { resolution: { width: 10, height: 10 } },
      chapters: [{ steps: [] }, { steps: [] }],
    },
    ...overrides,
  };
}

describe("checkChapterTitles", () => {
  it("warns when no chapter title screenshots are provided", () => {
    const results = checkChapterTitles(baseCtx());
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
    expect(results[0]!.message).toContain("skipped");
  });

  it("warns when only one chapter title screenshot is provided", () => {
    const screenshots = new Map<number, Buffer>();
    screenshots.set(0, solidPng(10, 10, 128, 128, 128));
    const results = checkChapterTitles(baseCtx({ chapterTitleScreenshots: screenshots }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
  });

  it("passes skipped when the spec only has one chapter", () => {
    const screenshots = new Map<number, Buffer>();
    screenshots.set(0, solidPng(10, 10, 128, 128, 128));
    const results = checkChapterTitles(
      baseCtx({
        spec: {
          meta: { resolution: { width: 10, height: 10 } },
          chapters: [{ steps: [] }],
        },
        chapterTitleScreenshots: screenshots,
      }),
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.message).toContain("skipped");
  });

  it("passes when chapter title screenshots are valid even if their content differs", () => {
    const dark = solidPng(10, 10, 30, 30, 40);
    const bright = solidPng(10, 10, 200, 200, 200);
    const screenshots = new Map<number, Buffer>();
    screenshots.set(0, dark);
    screenshots.set(1, bright);
    const results = checkChapterTitles(baseCtx({ chapterTitleScreenshots: screenshots }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("fails when chapter title screenshots have unstable dimensions", () => {
    const normal = solidPng(10, 10, 20, 20, 30);
    const resized = solidPng(20, 10, 20, 20, 30);
    const screenshots = new Map<number, Buffer>();
    screenshots.set(0, normal);
    screenshots.set(1, resized);
    const results = checkChapterTitles(baseCtx({ chapterTitleScreenshots: screenshots }));
    const fail = results.find((r) => r.status === "fail");
    expect(fail).toBeDefined();
    expect(fail!.message).toContain("dimensions changed");
  });

  it("compares pairs in order by chapter index", () => {
    const a = solidPng(10, 10, 20, 20, 30);
    const b = solidPng(10, 10, 128, 128, 128);
    const c = solidPng(20, 10, 200, 200, 200);
    const screenshots = new Map<number, Buffer>();
    screenshots.set(3, a);
    screenshots.set(1, b);
    screenshots.set(5, c);
    const results = checkChapterTitles(baseCtx({ chapterTitleScreenshots: screenshots }));
    const fails = results.filter((r) => r.status === "fail");
    expect(fails).toHaveLength(1);
    expect(fails[0]!.message).toContain("Chapter 5");
  });

  it("warns when a chapter title screenshot is blank", () => {
    const dark = solidPng(10, 10, 0, 0, 0);
    const valid = solidPng(10, 10, 128, 128, 128);
    const screenshots = new Map<number, Buffer>();
    screenshots.set(0, valid);
    screenshots.set(1, dark);
    const results = checkChapterTitles(baseCtx({ chapterTitleScreenshots: screenshots }));
    const warn = results.find((r) => r.status === "warn");
    expect(warn!.message).toContain("blank or near-blank");
  });

  it("all results have phase post-render", () => {
    const img = solidPng(10, 10, 128, 128, 128);
    const screenshots = new Map<number, Buffer>();
    screenshots.set(0, img);
    screenshots.set(1, img);
    const results = checkChapterTitles(baseCtx({ chapterTitleScreenshots: screenshots }));
    for (const r of results) {
      expect(r.phase).toBe("post-render");
    }
  });
});
