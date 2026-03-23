import { postRenderPass, postRenderFail } from "../../validation/types.js";
import type { CheckResult } from "../../validation/types.js";
import type { QualityCheckContext } from "../types.js";

const CHECK_NAME = "frame-rate:consistency";
const DEVIATION_THRESHOLD = 0.5;
const DUPLICATE_THRESHOLD_SEC = 0.001;

/** Compute consecutive intervals between PTS values. */
function computeIntervals(pts: number[]): number[] {
  const intervals: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    intervals.push(pts[i]! - pts[i - 1]!);
  }
  return intervals;
}

/** Compute the median of a non-empty numeric array. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Count frame drops and duplicate timestamps in intervals. */
function countDeviations(
  intervals: number[],
  medianInterval: number,
): { dropCount: number; duplicateCount: number } {
  let dropCount = 0;
  let duplicateCount = 0;
  for (const interval of intervals) {
    if (interval < DUPLICATE_THRESHOLD_SEC) {
      duplicateCount++;
    } else if (
      medianInterval > 0 &&
      Math.abs(interval - medianInterval) / medianInterval > DEVIATION_THRESHOLD
    ) {
      dropCount++;
    }
  }
  return { dropCount, duplicateCount };
}

/** Build a failure message from deviation counts, or return null if none. */
function buildDeviationMessage(dropCount: number, duplicateCount: number): string | null {
  const parts: string[] = [];
  if (dropCount > 0) parts.push(`${dropCount} frame drop(s) (>50% deviation from median interval)`);
  if (duplicateCount > 0) parts.push(`${duplicateCount} duplicate timestamp(s) (<1ms interval)`);
  return parts.length > 0 ? `Frame rate issues: ${parts.join("; ")}` : null;
}

export function checkFrameRate(ctx: QualityCheckContext): CheckResult[] {
  if (!ctx.framePtsSec || ctx.framePtsSec.length <= 1) {
    return [{ ...postRenderPass(CHECK_NAME), message: "No frame PTS data (skipped)" }];
  }

  const pts = ctx.framePtsSec.filter(Number.isFinite);
  if (pts.length < 2) {
    return [{ ...postRenderPass(CHECK_NAME), message: "Insufficient valid PTS data (skipped)" }];
  }

  const intervals = computeIntervals(pts);
  if (intervals.length === 0) {
    return [postRenderPass(CHECK_NAME)];
  }

  const med = median(intervals);
  const { dropCount, duplicateCount } = countDeviations(intervals, med);
  const msg = buildDeviationMessage(dropCount, duplicateCount);

  if (msg) {
    return [
      postRenderFail(CHECK_NAME, msg, "Check for encoding stalls or source frame duplication"),
    ];
  }

  return [postRenderPass(CHECK_NAME)];
}
