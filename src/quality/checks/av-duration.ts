import { postRenderPass, postRenderFail, postRenderWarn } from "../../validation/types.js";
import type { CheckResult } from "../../validation/types.js";
import type { QualityCheckContext } from "../types.js";

const MAX_DELTA_MS = 100;

export function checkAudioVideoDuration(ctx: QualityCheckContext): CheckResult[] {
  const name = "av-duration-parity";
  if (!ctx.probeResult) {
    return [postRenderWarn(name, "No probe data available (skipped)")];
  }
  const probe = ctx.probeResult;

  if (probe.audioDurationSec === null) {
    return [{ ...postRenderPass(name), message: "No audio stream (skipped)" }];
  }

  const deltaMs = Math.abs(probe.videoDurationSec - probe.audioDurationSec) * 1000;

  if (deltaMs <= MAX_DELTA_MS) {
    return [postRenderPass(name)];
  }

  return [
    postRenderFail(
      name,
      `Audio-video duration mismatch: video=${probe.videoDurationSec.toFixed(3)}s, ` +
        `audio=${probe.audioDurationSec.toFixed(3)}s, delta=${Math.round(deltaMs)}ms (max ${MAX_DELTA_MS}ms)`,
      "Check ffmpeg -ss flags for trim desync",
    ),
  ];
}
