import { postRenderPass, postRenderFail, postRenderWarn } from "../../validation/types.js";
import type { CheckResult } from "../../validation/types.js";
import type { QualityCheckContext } from "../types.js";

const CHECK_NAME = "timeline:intro-outro";
const DEFAULT_INTRO_MS = 2000;
const DEFAULT_OUTRO_MS = 2000;

/** Compute the minimum required duration in seconds from intro/outro config. */
function computeRequiredSec(ctx: QualityCheckContext): { requiredSec: number; label: string } {
  const introMs = ctx.introDurationMs ?? DEFAULT_INTRO_MS;
  const outroMs = ctx.outroDurationMs ?? DEFAULT_OUTRO_MS;
  let requiredMs = 0;
  const parts: string[] = [];
  if (ctx.hasIntro) {
    requiredMs += introMs;
    parts.push(`intro=${introMs}ms`);
  }
  if (ctx.hasOutro) {
    requiredMs += outroMs;
    parts.push(`outro=${outroMs}ms`);
  }
  return { requiredSec: requiredMs / 1000, label: parts.join(" + ") };
}

export function checkIntroOutro(ctx: QualityCheckContext): CheckResult[] {
  if (!ctx.hasIntro && !ctx.hasOutro) {
    return [{ ...postRenderPass(CHECK_NAME), message: "No intro/outro configured (skipped)" }];
  }

  if (!ctx.probeResult) {
    return [postRenderWarn(CHECK_NAME, "No probe data available (skipped)")];
  }

  const videoDurationSec = ctx.probeResult.videoDurationSec;
  const { requiredSec, label } = computeRequiredSec(ctx);

  if (videoDurationSec < requiredSec) {
    return [
      postRenderFail(
        CHECK_NAME,
        `Video duration ${videoDurationSec.toFixed(3)}s is shorter than required ${label} ` +
          `(${requiredSec.toFixed(1)}s minimum)`,
        "Check timeline construction — intro/outro segments may be overlapping or truncated",
      ),
    ];
  }

  return [postRenderPass(CHECK_NAME)];
}
