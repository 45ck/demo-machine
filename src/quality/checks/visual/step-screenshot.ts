import { postRenderPass, postRenderFail, postRenderWarn } from "../../../validation/types.js";
import type { CheckResult } from "../../../validation/types.js";
import type { QualityCheckContext } from "../../types.js";
import { diffImages } from "../../visual-diff.js";

const CHECK_NAME = "visual:step-screenshot";

/** Mismatch percentage that is worth surfacing, but is often valid demo progress. */
const WARN_MISMATCH_PERCENT = 35;

/** Catastrophic mismatch percentage that usually means a broken render or wrong page. */
const FAIL_MISMATCH_PERCENT = 80;

/**
 * Compare consecutive step screenshots to detect unexpected visual regressions.
 * Each pair of adjacent step screenshots is diffed; a high pixel mismatch
 * indicates an unexpected visual change between steps.
 */
export function checkStepScreenshots(ctx: QualityCheckContext): CheckResult[] {
  const screenshots = ctx.stepScreenshots;
  if (!screenshots || screenshots.size < 2) {
    return [postRenderWarn(CHECK_NAME, "Fewer than 2 step screenshots provided (skipped)")];
  }

  const indices = [...screenshots.keys()].sort((a, b) => a - b);
  const results: CheckResult[] = [];

  for (let i = 1; i < indices.length; i++) {
    const prevIdx = indices[i - 1]!;
    const currIdx = indices[i]!;
    const prevBuf = screenshots.get(prevIdx);
    const currBuf = screenshots.get(currIdx);

    if (!prevBuf || !currBuf) {
      continue;
    }

    const diff = diffImages(prevBuf, currBuf);

    if (diff.mismatchPercent > FAIL_MISMATCH_PERCENT) {
      results.push(
        postRenderFail(
          CHECK_NAME,
          `Steps ${String(prevIdx)}→${String(currIdx)}: ${diff.mismatchPercent.toFixed(2)}% pixel mismatch ` +
            `(${String(diff.mismatchCount)}/${String(diff.totalPixels)} pixels)`,
          "Catastrophic visual change between consecutive steps may indicate a wrong page, blank render, or major layout break",
        ),
      );
    } else if (diff.mismatchPercent > WARN_MISMATCH_PERCENT) {
      results.push(
        postRenderWarn(
          CHECK_NAME,
          `Steps ${String(prevIdx)}→${String(currIdx)}: ${diff.mismatchPercent.toFixed(2)}% pixel mismatch ` +
            `(${String(diff.mismatchCount)}/${String(diff.totalPixels)} pixels)`,
        ),
      );
    }
  }

  if (results.length === 0) {
    results.push(postRenderPass(CHECK_NAME));
  }

  return results;
}
