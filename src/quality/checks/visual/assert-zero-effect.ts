import { postRenderPass, postRenderFail, postRenderWarn } from "../../../validation/types.js";
import type { CheckResult } from "../../../validation/types.js";
import type { QualityCheckContext } from "../../types.js";
import { diffImages } from "../../visual-diff.js";

const CHECK_NAME = "visual:assert-zero-effect";

/**
 * Verify that assert steps produce zero visual change.
 * Compares before/after screenshots for each assert step.
 * Any pixel difference indicates a phantom overlay or focus ring leaked.
 */
export function checkAssertZeroEffect(ctx: QualityCheckContext): CheckResult[] {
  const pairs = ctx.assertScreenshotPairs;
  if (!pairs || pairs.length === 0) {
    return [postRenderWarn(CHECK_NAME, "No assert screenshot pairs provided (skipped)")];
  }

  const results: CheckResult[] = [];

  for (const pair of pairs) {
    const diff = diffImages(pair.before, pair.after);

    if (diff.mismatchCount > 0) {
      results.push(
        postRenderFail(
          CHECK_NAME,
          `Assert step ${String(pair.stepIndex)}: ${String(diff.mismatchCount)} pixels changed ` +
            `(${diff.mismatchPercent.toFixed(3)}%)`,
          "Assert steps must produce zero visual effects — check for leaked pulseFocus or flashSpotlight overlays",
        ),
      );
    }
  }

  if (results.length === 0) {
    results.push(postRenderPass(CHECK_NAME));
  }

  return results;
}
