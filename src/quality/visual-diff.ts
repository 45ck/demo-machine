import { createRequire } from "node:module";

/** Result of comparing two PNG images pixel-by-pixel. */
export interface PixelDiffResult {
  mismatchCount: number;
  mismatchPercent: number;
  totalPixels: number;
}

/** Locally typed PNG sync interface (pngjs has no @types package). */
interface PngImage {
  data: Uint8Array;
  width: number;
  height: number;
}

interface PngStatic {
  sync: { read: (buf: Buffer) => PngImage };
}

type PixelmatchFn = (
  img1: Uint8Array,
  img2: Uint8Array,
  output: null,
  width: number,
  height: number,
  options: { threshold: number },
) => number;

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as { PNG: PngStatic };
const pixelmatch = (require("pixelmatch") as { default: PixelmatchFn }).default;

/**
 * Compare two PNG buffers and return pixel-level diff statistics.
 * @param img1 - First PNG image as a Buffer.
 * @param img2 - Second PNG image as a Buffer.
 * @param threshold - Matching threshold (0-1), passed to pixelmatch. Default 0.1.
 */
export function diffImages(img1: Buffer, img2: Buffer, threshold = 0.1): PixelDiffResult {
  const a = PNG.sync.read(img1);
  const b = PNG.sync.read(img2);

  if (a.width !== b.width || a.height !== b.height) {
    const totalPixels = Math.max(a.width * a.height, b.width * b.height);
    return { mismatchCount: totalPixels, mismatchPercent: 100, totalPixels };
  }

  const totalPixels = a.width * a.height;
  if (totalPixels === 0) {
    return { mismatchCount: 0, mismatchPercent: 0, totalPixels: 0 };
  }

  const mismatchCount = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold });
  const mismatchPercent = (mismatchCount / totalPixels) * 100;

  return { mismatchCount, mismatchPercent, totalPixels };
}

/** RGB color target with optional per-channel tolerance. */
export interface ColorTarget {
  r: number;
  g: number;
  b: number;
  /** Maximum allowed distance per channel. Default 10. */
  tolerance?: number;
}

/**
 * Count pixels in a PNG buffer that match a target RGB color within tolerance.
 * @param img - PNG image as a Buffer.
 * @param color - Target RGB color and optional tolerance.
 */
export function countColorPixels(img: Buffer, color: ColorTarget): number {
  const { r, g, b, tolerance = 10 } = color;
  const png = PNG.sync.read(img);
  const { data, width, height } = png;
  let count = 0;

  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    const pr = data[offset]!;
    const pg = data[offset + 1]!;
    const pb = data[offset + 2]!;

    if (
      Math.abs(pr - r) <= tolerance &&
      Math.abs(pg - g) <= tolerance &&
      Math.abs(pb - b) <= tolerance
    ) {
      count++;
    }
  }

  return count;
}
