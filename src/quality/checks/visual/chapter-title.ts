import { postRenderPass, postRenderFail, postRenderWarn } from "../../../validation/types.js";
import type { CheckResult } from "../../../validation/types.js";
import type { QualityCheckContext } from "../../types.js";
import { diffImages } from "../../visual-diff.js";

const CHECK_NAME = "visual:chapter-title";

/** Maximum allowed mismatch percentage between consecutive chapter titles. */
const MAX_MISMATCH_PERCENT = 5;

/**
 * Extract the first frame of each chapter segment and diff consecutive
 * chapter title screenshots to catch drawtext rendering issues.
 * A high mismatch between chapter title frames may indicate font rendering
 * problems or overlay artifacts.
 */
export function checkChapterTitles(ctx: QualityCheckContext): CheckResult[] {
  const screenshots = ctx.chapterTitleScreenshots;
  if (!screenshots || screenshots.size < 2) {
    return [
      postRenderWarn(CHECK_NAME, "Fewer than 2 chapter title screenshots provided (skipped)"),
    ];
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

    if (diff.mismatchPercent > MAX_MISMATCH_PERCENT) {
      results.push(
        postRenderFail(
          CHECK_NAME,
          `Chapters ${String(prevIdx)}→${String(currIdx)}: ${diff.mismatchPercent.toFixed(2)}% pixel mismatch ` +
            `(${String(diff.mismatchCount)}/${String(diff.totalPixels)} pixels)`,
          "Significant difference between chapter title frames may indicate drawtext rendering issues",
        ),
      );
    }
  }

  if (results.length === 0) {
    results.push(postRenderPass(CHECK_NAME));
  }

  return results;
}
