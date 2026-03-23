import { postRenderPass, postRenderFail, postRenderWarn } from "../../../validation/types.js";
import type { CheckResult } from "../../../validation/types.js";
import type { QualityCheckContext } from "../../types.js";

const CHECK_NAME = "visual:cursor-position";

/** Maximum allowed distance (px) between cursor and target center. */
const TOLERANCE_PX = 5;

/**
 * Verify cursor overlay position is within tolerance of the target element's
 * bounding box center at click moments.
 */
export function checkCursorPosition(ctx: QualityCheckContext): CheckResult[] {
  const positions = ctx.cursorPositions;
  if (!positions || positions.length === 0) {
    return [postRenderWarn(CHECK_NAME, "No cursor position data provided (skipped)")];
  }

  const results: CheckResult[] = [];

  for (const pos of positions) {
    const dx = pos.cursorX - pos.targetCenterX;
    const dy = pos.cursorY - pos.targetCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > TOLERANCE_PX) {
      results.push(
        postRenderFail(
          CHECK_NAME,
          `Step ${String(pos.stepIndex)}: cursor at (${String(pos.cursorX)},${String(pos.cursorY)}) ` +
            `is ${distance.toFixed(1)}px from target center ` +
            `(${String(pos.targetCenterX)},${String(pos.targetCenterY)})`,
          `Cursor should be within ${String(TOLERANCE_PX)}px of the target element center`,
        ),
      );
    }
  }

  if (results.length === 0) {
    results.push(postRenderPass(CHECK_NAME));
  }

  return results;
}
