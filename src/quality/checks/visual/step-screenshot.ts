import { postRenderPass, postRenderFail, postRenderWarn } from "../../../validation/types.js";
import type { CheckResult } from "../../../validation/types.js";
import type { QualityCheckContext } from "../../types.js";
import { diffImages } from "../../visual-diff.js";
import { checkScreenshotArtifactQuality } from "./screenshot-quality.js";

const CHECK_NAME = "visual:step-screenshot";

/** Mismatch percentage that is worth surfacing, but is often valid demo progress. */
const WARN_MISMATCH_PERCENT = 35;

/**
 * Compare consecutive step screenshots to detect unexpected visual regressions.
 * Each pair of adjacent step screenshots is diffed; a high pixel mismatch
 * indicates an unexpected visual change between steps.
 */
export function checkStepScreenshots(ctx: QualityCheckContext): CheckResult[] {
  const screenshots = ctx.stepScreenshots;
  if (!screenshots || screenshots.size === 0) {
    return [postRenderWarn(CHECK_NAME, "No step screenshots provided (skipped)")];
  }

  const indices = [...screenshots.keys()].sort((a, b) => a - b);
  const results: CheckResult[] = checkScreenshotArtifactQuality({
    checkName: CHECK_NAME,
    expected: ctx.spec.meta.resolution,
    artifacts: collectStepScreenshotArtifacts(screenshots, indices),
  });

  if (screenshots.size < 2) {
    results.push(postRenderWarn(CHECK_NAME, "Fewer than 2 step screenshots provided (skipped)"));
    return results;
  }

  results.push(...compareConsecutiveStepScreenshots(screenshots, indices));

  if (results.length === 0) {
    results.push(postRenderPass(CHECK_NAME));
  }

  return results;
}

function compareConsecutiveStepScreenshots(
  screenshots: Map<number, Buffer>,
  indices: number[],
): CheckResult[] {
  const results: CheckResult[] = [];
  for (let i = 1; i < indices.length; i++) {
    const prevIdx = indices[i - 1]!;
    const currIdx = indices[i]!;
    const prevBuf = screenshots.get(prevIdx);
    const currBuf = screenshots.get(currIdx);

    if (!prevBuf || !currBuf) {
      continue;
    }

    const diff = diffStepImages({ prevIdx, currIdx, prevBuf, currBuf, results });
    if (!diff) continue;

    if (diff.mismatchPercent > WARN_MISMATCH_PERCENT) {
      results.push(
        postRenderWarn(
          CHECK_NAME,
          `Steps ${String(prevIdx)}→${String(currIdx)}: ${diff.mismatchPercent.toFixed(2)}% pixel mismatch ` +
            `(${String(diff.mismatchCount)}/${String(diff.totalPixels)} pixels)`,
        ),
      );
    }
  }

  return results;
}

function collectStepScreenshotArtifacts(
  screenshots: Map<number, Buffer>,
  indices: number[],
): Array<{ label: string; buffer: Buffer }> {
  return indices.flatMap((index) => {
    const buffer = screenshots.get(index);
    return buffer ? [{ label: `Step ${String(index)}`, buffer }] : [];
  });
}

function diffStepImages(params: {
  prevIdx: number;
  currIdx: number;
  prevBuf: Buffer;
  currBuf: Buffer;
  results: CheckResult[];
}): ReturnType<typeof diffImages> | null {
  const { prevIdx, currIdx, prevBuf, currBuf, results } = params;
  try {
    return diffImages(prevBuf, currBuf);
  } catch (err) {
    results.push(
      postRenderFail(
        CHECK_NAME,
        `Steps ${String(prevIdx)}→${String(currIdx)}: unable to diff screenshot PNGs`,
        err instanceof Error ? err.message : "One or both screenshots were invalid PNG data",
      ),
    );
    return null;
  }
}
