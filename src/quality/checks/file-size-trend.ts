import { postRenderPass, postRenderWarn } from "../../validation/types.js";
import type { CheckResult } from "../../validation/types.js";
import type { QualityCheckContext } from "../types.js";

const CHECK_NAME = "file-size-trend";

/** Maximum allowed change ratio (30%). */
const MAX_CHANGE_RATIO = 0.3;

function formatMB(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}

/**
 * File size regression guard (#48).
 *
 * Compares the current file size against the previous run's size.
 * If the file grew or shrank by more than 30%, emits a warning about
 * potential regression.
 *
 * This is distinct from the absolute budget check in file-size.ts —
 * it catches *relative* changes between consecutive runs.
 */
export function checkFileSizeTrend(
  ctx: QualityCheckContext,
  previousSizeBytes: number | undefined,
): CheckResult[] {
  const current = ctx.fileSizeBytes;

  if (current === undefined) {
    return [{ ...postRenderPass(CHECK_NAME), message: "Current size unknown (skipped)" }];
  }

  if (previousSizeBytes === undefined || previousSizeBytes === 0) {
    return [{ ...postRenderPass(CHECK_NAME), message: "No previous size available (first run)" }];
  }

  const delta = current - previousSizeBytes;
  const ratio = Math.abs(delta) / previousSizeBytes;

  if (ratio <= MAX_CHANGE_RATIO) {
    return [postRenderPass(CHECK_NAME)];
  }

  const pct = Math.round(ratio * 100);
  const direction = delta > 0 ? "grew" : "shrank";

  return [
    {
      ...postRenderWarn(
        CHECK_NAME,
        `File size ${direction} by ${String(pct)}%: ${formatMB(previousSizeBytes)} MB → ${formatMB(current)} MB`,
      ),
      suggestion:
        "Investigate for potential regression — check resolution, compression settings, or pacing changes",
    },
  ];
}
