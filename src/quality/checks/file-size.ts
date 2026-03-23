import { postRenderPass, postRenderFail, postRenderWarn } from "../../validation/types.js";
import type { CheckResult } from "../../validation/types.js";
import type { QualityCheckContext } from "../types.js";

function formatMB(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}

export function checkFileSize(ctx: QualityCheckContext): CheckResult[] {
  const name = "file-size-budget";
  const budget = ctx.manifestEntry?.maxOutputBytes;

  if (budget === undefined) {
    return [{ ...postRenderPass(name), message: "No budget configured (skipped)" }];
  }

  if (budget <= 0) {
    return [postRenderWarn(name, `Invalid budget: ${budget} bytes (must be positive)`)];
  }

  const actual = ctx.fileSizeBytes;

  if (actual === undefined) {
    return [postRenderWarn(name, "File size could not be determined (stat failed)")];
  }

  if (actual === 0) {
    return [postRenderFail(name, "File is empty (0 bytes)", "Render may have failed silently")];
  }

  if (actual <= budget) {
    return [postRenderPass(name)];
  }

  const pct = Math.round((actual / budget) * 100);
  return [
    postRenderFail(
      name,
      `File size ${formatMB(actual)} MB exceeds budget of ${formatMB(budget)} MB (${pct}% of budget)`,
      "Check for resolution inflation, broken compression, or unintended pacing changes",
    ),
  ];
}
