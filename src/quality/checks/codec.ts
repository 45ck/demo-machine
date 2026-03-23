import { postRenderPass, postRenderFail, postRenderWarn } from "../../validation/types.js";
import type { CheckResult } from "../../validation/types.js";
import type { QualityCheckContext } from "../types.js";

export function checkCodecCompliance(ctx: QualityCheckContext): CheckResult[] {
  if (!ctx.probeResult) {
    return [postRenderWarn("codec", "No probe data available (skipped)")];
  }
  const probe = ctx.probeResult;
  const results: CheckResult[] = [];

  if (probe.videoCodec === "h264") {
    results.push(postRenderPass("codec:video-codec"));
  } else {
    results.push(
      postRenderFail(
        "codec:video-codec",
        `Expected video codec h264 but got ${probe.videoCodec}`,
        "Use -c:v libx264 in ffmpeg args",
      ),
    );
  }

  if (probe.pixFmt === "yuv420p") {
    results.push(postRenderPass("codec:pixel-format"));
  } else {
    results.push(
      postRenderFail(
        "codec:pixel-format",
        `Expected pixel format yuv420p but got ${probe.pixFmt}`,
        "yuv420p is required for Safari/iOS compatibility",
      ),
    );
  }

  if (probe.containerFormat.includes("mp4")) {
    results.push(postRenderPass("codec:container"));
  } else {
    results.push(
      postRenderFail("codec:container", `Expected MP4 container but got ${probe.containerFormat}`),
    );
  }

  return results;
}
