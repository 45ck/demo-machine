import { postRenderPass, postRenderFail } from "../../../validation/types.js";
import type { CheckResult } from "../../../validation/types.js";
import type { QualityCheckContext } from "../../types.js";

const CHECK_NAME = "visual:cursor-position";
const CLICK_ACTIONS = new Set(["click", "clickFirstVisible"]);

/** Maximum allowed distance (px) between cursor and target center. */
const TOLERANCE_PX = 5;

function expectedCursorSampleCount(ctx: QualityCheckContext): number | null {
  if (ctx.spec.visuals?.cursor === false) return 0;
  const chapters = ctx.spec.chapters;
  if (!chapters) return null;
  let count = 0;
  for (const chapter of chapters) {
    for (const step of chapter.steps ?? []) {
      if (step.action && CLICK_ACTIONS.has(step.action)) count++;
    }
  }
  return count;
}

/**
 * Verify cursor overlay position is within tolerance of the target element's
 * bounding box center at click moments.
 */
export function checkCursorPosition(ctx: QualityCheckContext): CheckResult[] {
  const positions = ctx.cursorPositions;
  if (!positions || positions.length === 0) {
    const expectedCount = expectedCursorSampleCount(ctx);
    if (expectedCount === null || expectedCount === 0) {
      return [
        {
          ...postRenderPass(CHECK_NAME),
          message: "No click cursor positions expected (skipped)",
        },
      ];
    }
    return [
      postRenderFail(
        CHECK_NAME,
        "No cursor position data recorded for expected click actions",
        "Keep the Demo Machine cursor overlay present and visible at each click",
      ),
    ];
  }

  const results: CheckResult[] = [];
  const expectedCount = expectedCursorSampleCount(ctx);
  if (expectedCount !== null && positions.length < expectedCount) {
    results.push(
      postRenderFail(
        CHECK_NAME,
        `Recorded ${String(positions.length)}/${String(expectedCount)} expected cursor position sample(s)`,
        "Record the real cursor overlay position for every click action",
      ),
    );
  }

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
