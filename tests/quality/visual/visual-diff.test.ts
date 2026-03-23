import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import { diffImages, countColorPixels } from "../../../src/quality/visual-diff.js";

/** Create a solid-color PNG buffer of the given size and RGBA values. */
function solidPng(width: number, height: number, r: number, g: number, b: number, a = 255): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    png.data[offset] = r;
    png.data[offset + 1] = g;
    png.data[offset + 2] = b;
    png.data[offset + 3] = a;
  }
  return PNG.sync.write(png);
}

describe("diffImages", () => {
  it("returns zero mismatch for identical images", () => {
    const img = solidPng(10, 10, 128, 128, 128);
    const result = diffImages(img, img);
    expect(result.mismatchCount).toBe(0);
    expect(result.mismatchPercent).toBe(0);
    expect(result.totalPixels).toBe(100);
  });

  it("detects all pixels different for opposite colors", () => {
    const black = solidPng(10, 10, 0, 0, 0);
    const white = solidPng(10, 10, 255, 255, 255);
    const result = diffImages(black, white);
    expect(result.mismatchCount).toBe(100);
    expect(result.mismatchPercent).toBe(100);
    expect(result.totalPixels).toBe(100);
  });

  it("returns 100% mismatch when dimensions differ", () => {
    const small = solidPng(5, 5, 128, 128, 128);
    const big = solidPng(10, 10, 128, 128, 128);
    const result = diffImages(small, big);
    expect(result.mismatchPercent).toBe(100);
    expect(result.totalPixels).toBe(100); // max of the two
  });

  it("handles partially different images", () => {
    const png1 = new PNG({ width: 10, height: 10 });
    const png2 = new PNG({ width: 10, height: 10 });
    for (let i = 0; i < 100; i++) {
      const offset = i * 4;
      png1.data[offset] = 128;
      png1.data[offset + 1] = 128;
      png1.data[offset + 2] = 128;
      png1.data[offset + 3] = 255;

      // First 50 pixels same, last 50 different
      if (i < 50) {
        png2.data[offset] = 128;
        png2.data[offset + 1] = 128;
        png2.data[offset + 2] = 128;
      } else {
        png2.data[offset] = 0;
        png2.data[offset + 1] = 0;
        png2.data[offset + 2] = 0;
      }
      png2.data[offset + 3] = 255;
    }
    const buf1 = PNG.sync.write(png1);
    const buf2 = PNG.sync.write(png2);
    const result = diffImages(buf1, buf2);
    expect(result.mismatchCount).toBe(50);
    expect(result.mismatchPercent).toBe(50);
  });

  it("respects custom threshold parameter", () => {
    // Slightly different colors: should match at high threshold, mismatch at zero threshold
    const a = solidPng(10, 10, 128, 128, 128);
    const b = solidPng(10, 10, 130, 130, 130);

    const strictResult = diffImages(a, b, 0);
    const lenientResult = diffImages(a, b, 0.5);

    expect(strictResult.mismatchCount).toBeGreaterThan(0);
    expect(lenientResult.mismatchCount).toBe(0);
  });
});

describe("countColorPixels", () => {
  it("counts exact color matches in a solid image", () => {
    const img = solidPng(10, 10, 50, 220, 255);
    const count = countColorPixels(img, { r: 50, g: 220, b: 255 });
    expect(count).toBe(100);
  });

  it("returns 0 for a completely different color", () => {
    const img = solidPng(10, 10, 0, 0, 0);
    const count = countColorPixels(img, { r: 50, g: 220, b: 255 });
    expect(count).toBe(0);
  });

  it("respects tolerance parameter", () => {
    const img = solidPng(10, 10, 55, 225, 250);

    // Within tolerance of 10 from (50,220,255)
    const withTolerance = countColorPixels(img, { r: 50, g: 220, b: 255, tolerance: 10 });
    expect(withTolerance).toBe(100);

    // Outside tolerance of 2
    const strictTolerance = countColorPixels(img, { r: 50, g: 220, b: 255, tolerance: 2 });
    expect(strictTolerance).toBe(0);
  });

  it("counts only matching pixels in a mixed image", () => {
    const png = new PNG({ width: 10, height: 10 });
    for (let i = 0; i < 100; i++) {
      const offset = i * 4;
      if (i < 30) {
        // Accent color
        png.data[offset] = 50;
        png.data[offset + 1] = 220;
        png.data[offset + 2] = 255;
      } else {
        // Black
        png.data[offset] = 0;
        png.data[offset + 1] = 0;
        png.data[offset + 2] = 0;
      }
      png.data[offset + 3] = 255;
    }
    const buf = PNG.sync.write(png);
    const count = countColorPixels(buf, { r: 50, g: 220, b: 255, tolerance: 0 });
    expect(count).toBe(30);
  });
});
