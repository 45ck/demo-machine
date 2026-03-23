import { describe, it, expect } from "vitest";
import type { QualityCheckContext } from "../../src/quality/types.js";
import { checkCodecCompliance } from "../../src/quality/checks/codec.js";

function ctx(overrides?: {
  videoCodec?: string;
  pixFmt?: string;
  containerFormat?: string;
}): QualityCheckContext {
  return {
    outputMp4Path: "/out/output.mp4",
    spec: { meta: { resolution: { width: 1920, height: 1080 } } },
    probeResult: {
      width: 1920,
      height: 1080,
      sar: "1:1",
      videoCodec: overrides?.videoCodec ?? "h264",
      pixFmt: overrides?.pixFmt ?? "yuv420p",
      containerFormat: overrides?.containerFormat ?? "mov,mp4,m4a,3gp,3g2,mj2",
      videoDurationSec: 10,
      audioDurationSec: 10,
    },
  };
}

describe("checkCodecCompliance", () => {
  it("passes when codec is h264, pix_fmt is yuv420p, and container includes mp4", () => {
    const results = checkCodecCompliance(ctx());
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "pass")).toBe(true);
  });

  it("fails when video codec is not h264", () => {
    const results = checkCodecCompliance(ctx({ videoCodec: "vp9" }));
    const fail = results.find((r) => r.checkName === "codec:video-codec");
    expect(fail).toBeDefined();
    expect(fail!.status).toBe("fail");
    expect(fail!.message).toContain("vp9");
  });

  it("fails when pix_fmt is not yuv420p", () => {
    const results = checkCodecCompliance(ctx({ pixFmt: "yuv444p" }));
    const fail = results.find((r) => r.checkName === "codec:pixel-format");
    expect(fail).toBeDefined();
    expect(fail!.status).toBe("fail");
    expect(fail!.message).toContain("yuv444p");
  });

  it("fails when container format does not include mp4", () => {
    const results = checkCodecCompliance(ctx({ containerFormat: "matroska,webm" }));
    const fail = results.find((r) => r.checkName === "codec:container");
    expect(fail).toBeDefined();
    expect(fail!.status).toBe("fail");
    expect(fail!.message).toContain("matroska");
  });

  it("handles full ffprobe container string containing mp4", () => {
    const results = checkCodecCompliance(ctx({ containerFormat: "mov,mp4,m4a,3gp,3g2,mj2" }));
    const containerResult = results.find((r) => r.checkName === "codec:container");
    expect(containerResult!.status).toBe("pass");
  });

  it("produces separate CheckResult entries for each failing sub-check", () => {
    const results = checkCodecCompliance(
      ctx({ videoCodec: "vp9", pixFmt: "yuv444p", containerFormat: "webm" }),
    );
    const fails = results.filter((r) => r.status === "fail");
    expect(fails).toHaveLength(3);
    expect(fails.map((r) => r.checkName)).toEqual([
      "codec:video-codec",
      "codec:pixel-format",
      "codec:container",
    ]);
  });

  it("includes actual codec name in failure message", () => {
    const results = checkCodecCompliance(ctx({ videoCodec: "hevc" }));
    const fail = results.find((r) => r.checkName === "codec:video-codec");
    expect(fail!.message).toContain("hevc");
    expect(fail!.message).toContain("h264");
  });

  it("all results have phase post-render", () => {
    const results = checkCodecCompliance(ctx());
    for (const r of results) {
      expect(r.phase).toBe("post-render");
    }
  });

  it("returns warn when probeResult is undefined", () => {
    const c: QualityCheckContext = {
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
    };
    const results = checkCodecCompliance(c);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
  });
});
