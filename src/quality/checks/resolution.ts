import { postRenderPass, postRenderFail, postRenderWarn } from "../../validation/types.js";
import type { CheckResult } from "../../validation/types.js";
import type { QualityCheckContext } from "../types.js";

export function checkResolution(ctx: QualityCheckContext): CheckResult[] {
  if (!ctx.probeResult) {
    return [postRenderWarn("resolution", "No probe data available (skipped)")];
  }
  const results: CheckResult[] = [];
  const probe = ctx.probeResult;
  const expected = ctx.spec.meta.resolution;

  if (probe.width === expected.width && probe.height === expected.height) {
    results.push(postRenderPass("resolution:dimensions"));
  } else {
    results.push(
      postRenderFail(
        "resolution:dimensions",
        `Expected ${expected.width}x${expected.height} but got ${probe.width}x${probe.height}`,
      ),
    );
  }

  if (probe.sar === "1:1") {
    results.push(postRenderPass("resolution:sar"));
  } else {
    results.push(
      postRenderFail(
        "resolution:sar",
        `Expected SAR 1:1 but got ${probe.sar}`,
        "Non-square pixels cause stretched playback in some players",
      ),
    );
  }

  return results;
}
