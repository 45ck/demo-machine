import { postRenderFail, postRenderWarn } from "../../../validation/types.js";
import type { CheckResult } from "../../../validation/types.js";
import {
  isOptionalVisualDependencyError,
  loadPng,
  type PngImage,
} from "../../optional-visual-deps.js";

interface ScreenshotQualityArtifact {
  label: string;
  buffer: Buffer;
}

interface ExpectedScreenshotDimensions {
  width: number;
  height: number;
}

export function checkScreenshotArtifactQuality(params: {
  checkName: string;
  artifacts: ScreenshotQualityArtifact[];
  expected: ExpectedScreenshotDimensions;
}): CheckResult[] {
  const results: CheckResult[] = [];

  for (const artifact of params.artifacts) {
    const png = readPng(params.checkName, artifact, results);
    if (!png) continue;
    checkDimensions({
      checkName: params.checkName,
      label: artifact.label,
      png,
      expected: params.expected,
      results,
    });
    checkNotBlank(params.checkName, artifact.label, png, results);
  }

  return results;
}

function readPng(
  checkName: string,
  artifact: ScreenshotQualityArtifact,
  results: CheckResult[],
): PngImage | null {
  try {
    return loadPng().sync.read(artifact.buffer);
  } catch (err) {
    if (isOptionalVisualDependencyError(err)) {
      results.push(postRenderWarn(checkName, `${artifact.label}: ${err.message} (skipped)`));
      return null;
    }
    results.push(
      postRenderFail(
        checkName,
        `${artifact.label}: screenshot artifact is not a readable PNG`,
        err instanceof Error ? err.message : "Capture produced an invalid PNG buffer",
      ),
    );
    return null;
  }
}

function checkDimensions(params: {
  checkName: string;
  label: string;
  png: PngImage;
  expected: ExpectedScreenshotDimensions;
  results: CheckResult[];
}): void {
  const { checkName, label, png, expected, results } = params;
  if (png.width === expected.width && png.height === expected.height) return;
  results.push(
    postRenderFail(
      checkName,
      `${label}: screenshot dimensions ${String(png.width)}x${String(png.height)} do not match expected viewport ${String(expected.width)}x${String(expected.height)}`,
      "Capture screenshots at the same viewport resolution declared in the spec metadata",
    ),
  );
}

function checkNotBlank(
  checkName: string,
  label: string,
  png: PngImage,
  results: CheckResult[],
): void {
  if (png.width <= 0 || png.height <= 0) {
    results.push(postRenderFail(checkName, `${label}: screenshot artifact has no pixels`));
    return;
  }
  if (!isBlankFrame(png)) return;
  results.push(
    postRenderFail(
      checkName,
      `${label}: screenshot artifact appears blank`,
      "Verify capture happened after the page rendered and before any cleanup removed the visible scene",
    ),
  );
}

function isBlankFrame(png: PngImage): boolean {
  const first = firstPixel(png);
  if (!isBlankColor(first)) return false;

  for (let offset = 4; offset < png.data.length; offset += 4) {
    if (!samePixel(png, offset, first)) return false;
  }
  return true;
}

function firstPixel(png: PngImage): { r: number; g: number; b: number; a: number } {
  return {
    r: png.data[0] ?? 0,
    g: png.data[1] ?? 0,
    b: png.data[2] ?? 0,
    a: png.data[3] ?? 255,
  };
}

function samePixel(
  png: PngImage,
  offset: number,
  color: { r: number; g: number; b: number; a: number },
): boolean {
  return (
    png.data[offset] === color.r &&
    png.data[offset + 1] === color.g &&
    png.data[offset + 2] === color.b &&
    png.data[offset + 3] === color.a
  );
}

function isBlankColor(color: { r: number; g: number; b: number; a: number }): boolean {
  if (color.a === 0) return true;
  const black = color.r <= 2 && color.g <= 2 && color.b <= 2;
  const white = color.r >= 253 && color.g >= 253 && color.b >= 253;
  return black || white;
}
