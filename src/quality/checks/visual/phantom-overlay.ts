import { postRenderPass, postRenderFail, postRenderWarn } from "../../../validation/types.js";
import type { CheckResult } from "../../../validation/types.js";
import type { QualityCheckContext } from "../../types.js";
import { countColorPixels } from "../../visual-diff.js";

const CHECK_NAME = "visual:phantom-overlay";

/** demo-machine accent color: #32dcff -> RGB(50, 220, 255). */
const ACCENT_COLOR = { r: 50, g: 220, b: 255, tolerance: 15 } as const;

/** Maximum number of accent-colored pixels allowed during an assert step. */
const MAX_ACCENT_PIXELS = 10;

/**
 * Scan assert-step screenshots for newly introduced demo-machine accent color
 * (#32dcff). Product UIs may legitimately contain similar accent colors, so a
 * stable before/after count is not enough evidence of an overlay leak.
 */
export function checkPhantomOverlay(ctx: QualityCheckContext): CheckResult[] {
  const pairs = ctx.assertScreenshotPairs;
  if (!pairs || pairs.length === 0) {
    return [postRenderWarn(CHECK_NAME, "No assert screenshot pairs provided (skipped)")];
  }

  const results: CheckResult[] = [];

  for (const pair of pairs) {
    const beforeCount = countColorPixels(pair.before, ACCENT_COLOR);
    const afterCount = countColorPixels(pair.after, ACCENT_COLOR);
    const introducedCount = Math.max(0, afterCount - beforeCount);

    if (introducedCount > MAX_ACCENT_PIXELS) {
      results.push(
        postRenderFail(
          CHECK_NAME,
          `Assert step ${String(pair.stepIndex)}: ${String(introducedCount)} new accent-color (#32dcff) pixels detected ` +
            `(threshold: ${String(MAX_ACCENT_PIXELS)})`,
          "Accent-colored pixels during assert indicate a leaked cursor overlay or focus ring",
        ),
      );
    }
  }

  if (results.length === 0) {
    results.push(postRenderPass(CHECK_NAME));
  }

  return results;
}
