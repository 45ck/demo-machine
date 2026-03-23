import { describe, it, expect } from "vitest";
import type { QualityCheckContext } from "../../src/quality/types.js";
import { checkAudioVideoDuration } from "../../src/quality/checks/av-duration.js";

function ctx(videoDuration: number, audioDuration: number | null): QualityCheckContext {
  return {
    outputMp4Path: "/out/output.mp4",
    spec: { meta: { resolution: { width: 1920, height: 1080 } } },
    probeResult: {
      width: 1920,
      height: 1080,
      sar: "1:1",
      videoCodec: "h264",
      pixFmt: "yuv420p",
      containerFormat: "mov,mp4,m4a,3gp,3g2,mj2",
      videoDurationSec: videoDuration,
      audioDurationSec: audioDuration,
    },
  };
}

describe("checkAudioVideoDuration", () => {
  it("passes when audio and video durations differ by less than 100ms", () => {
    const results = checkAudioVideoDuration(ctx(10.0, 10.05));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("passes when durations are exactly equal", () => {
    const results = checkAudioVideoDuration(ctx(10.0, 10.0));
    expect(results[0]!.status).toBe("pass");
  });

  it("fails when durations differ by more than 100ms", () => {
    const results = checkAudioVideoDuration(ctx(10.0, 10.5));
    expect(results[0]!.status).toBe("fail");
    expect(results[0]!.message).toContain("500");
  });

  it("passes (skip) when there is no audio stream", () => {
    const results = checkAudioVideoDuration(ctx(10.0, null));
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.message).toMatch(/no audio/i);
  });

  it("includes both durations and delta in failure message", () => {
    const results = checkAudioVideoDuration(ctx(10.0, 10.3));
    const fail = results[0]!;
    expect(fail.status).toBe("fail");
    expect(fail.message).toContain("10.000");
    expect(fail.message).toContain("10.300");
  });

  it("boundary: exactly 100ms difference passes", () => {
    const results = checkAudioVideoDuration(ctx(10.0, 10.1));
    expect(results[0]!.status).toBe("pass");
  });

  it("boundary: 101ms difference fails", () => {
    const results = checkAudioVideoDuration(ctx(10.0, 10.101));
    expect(results[0]!.status).toBe("fail");
  });

  it("all results have phase post-render and checkName av-duration-parity", () => {
    const results = checkAudioVideoDuration(ctx(10.0, 10.0));
    expect(results[0]!.phase).toBe("post-render");
    expect(results[0]!.checkName).toBe("av-duration-parity");
  });

  it("fails when audio is shorter than video by more than 100ms", () => {
    const results = checkAudioVideoDuration(ctx(10.5, 10.0));
    expect(results[0]!.status).toBe("fail");
  });

  it("returns warn when probeResult is undefined", () => {
    const c: QualityCheckContext = {
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
    };
    const results = checkAudioVideoDuration(c);
    expect(results[0]!.status).toBe("warn");
  });
});
