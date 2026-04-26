import { createRequire } from "node:module";
import { postRenderPass, postRenderFail, postRenderWarn } from "../../../validation/types.js";
import type { CheckResult } from "../../../validation/types.js";
import type { QualityCheckContext } from "../../types.js";

const CHECK_NAME = "visual:chapter-title";

const BLANK_STDDEV_THRESHOLD = 4;
const BLANK_DARK_LUMA = 8;
const BLANK_LIGHT_LUMA = 247;

interface PngImage {
  data: Uint8Array;
  width: number;
  height: number;
}

interface PngStatic {
  sync: { read: (buf: Buffer) => PngImage };
}

interface Dimensions {
  width: number;
  height: number;
}

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as { PNG: PngStatic };

/**
 * Validate captured chapter title frames. Different chapters are expected to
 * contain different text and often different page content, so this check avoids
 * pixel-diffing chapter screens against each other. It instead verifies that
 * every captured title frame is decodable, has stable geometry, and is not a
 * blank/near-blank image.
 */
export function checkChapterTitles(ctx: QualityCheckContext): CheckResult[] {
  const screenshots = ctx.chapterTitleScreenshots;
  const insufficient = checkInsufficientScreenshots(ctx, screenshots);
  if (insufficient) return [insufficient];

  const presentScreenshots = screenshots as Map<number, Buffer>;
  const indices = [...presentScreenshots.keys()].sort((a, b) => a - b);
  const results: CheckResult[] = [];
  let expectedDimensions: Dimensions | null = null;

  for (const chapterIndex of indices) {
    const screenshot = presentScreenshots.get(chapterIndex);
    if (!screenshot) continue;

    const decoded = decodeChapterScreenshot(chapterIndex, screenshot);
    if (decoded.status === "fail") {
      results.push(decoded.result);
      continue;
    }

    const image = decoded.image;
    if (image.width <= 0 || image.height <= 0) {
      results.push(
        postRenderFail(
          CHECK_NAME,
          `Chapter ${String(chapterIndex)} title screenshot has invalid dimensions`,
          "Capture a non-empty PNG chapter title frame",
        ),
      );
      continue;
    }

    expectedDimensions ??= { width: image.width, height: image.height };
    results.push(...checkDimensions(chapterIndex, image, expectedDimensions));
    results.push(...checkBlank(chapterIndex, image));
  }

  if (results.length === 0) {
    results.push(postRenderPass(CHECK_NAME));
  }

  return results;
}

function checkInsufficientScreenshots(
  ctx: QualityCheckContext,
  screenshots: Map<number, Buffer> | undefined,
): CheckResult | null {
  if (screenshots && screenshots.size >= 2) return null;
  if ((ctx.spec.chapters?.length ?? 0) < 2) {
    return { ...postRenderPass(CHECK_NAME), message: "Single chapter title screenshot (skipped)" };
  }
  return postRenderWarn(CHECK_NAME, "Fewer than 2 chapter title screenshots provided (skipped)");
}

function decodeChapterScreenshot(
  chapterIndex: number,
  screenshot: Buffer,
): { status: "ok"; image: PngImage } | { status: "fail"; result: CheckResult } {
  try {
    return { status: "ok", image: PNG.sync.read(screenshot) };
  } catch (err) {
    return {
      status: "fail",
      result: postRenderFail(
        CHECK_NAME,
        `Chapter ${String(chapterIndex)} title screenshot could not be decoded`,
        err instanceof Error ? err.message : "Capture a valid PNG chapter title frame",
      ),
    };
  }
}

function checkDimensions(
  chapterIndex: number,
  image: PngImage,
  expectedDimensions: Dimensions,
): CheckResult[] {
  if (image.width === expectedDimensions.width && image.height === expectedDimensions.height) {
    return [];
  }

  return [
    postRenderFail(
      CHECK_NAME,
      `Chapter ${String(chapterIndex)} title screenshot dimensions changed to ${String(
        image.width,
      )}x${String(image.height)}`,
      `Expected ${String(expectedDimensions.width)}x${String(expectedDimensions.height)}; check capture geometry and chapter title rendering`,
    ),
  ];
}

function checkBlank(chapterIndex: number, image: PngImage): CheckResult[] {
  if (!isBlankImage(image)) return [];

  return [
    postRenderWarn(
      CHECK_NAME,
      `Chapter ${String(chapterIndex)} title screenshot is blank or near-blank; check chapter title rendering and capture timing if this persists across runs`,
    ),
  ];
}

function isBlankImage(image: PngImage): boolean {
  const pixels = image.width * image.height;
  if (pixels === 0) return true;

  let sum = 0;
  let sumSquares = 0;
  let transparent = 0;

  for (let i = 0; i < image.data.length; i += 4) {
    const alpha = image.data[i + 3]!;
    if (alpha === 0) transparent++;
    const luma =
      0.2126 * image.data[i]! + 0.7152 * image.data[i + 1]! + 0.0722 * image.data[i + 2]!;
    sum += luma;
    sumSquares += luma * luma;
  }

  if (transparent / pixels > 0.99) return true;

  const meanLuma = sum / pixels;
  const variance = sumSquares / pixels - meanLuma * meanLuma;
  const stddevLuma = Math.sqrt(Math.max(0, variance));
  return (
    stddevLuma <= BLANK_STDDEV_THRESHOLD &&
    (meanLuma <= BLANK_DARK_LUMA || meanLuma >= BLANK_LIGHT_LUMA)
  );
}
