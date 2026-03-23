import { describe, it, expect } from "vitest";
import type { QualityCheckContext } from "../../src/quality/types.js";
import { checkIntroOutro } from "../../src/quality/checks/intro-outro.js";

function ctx(
  videoDurationSec: number | undefined,
  opts?: {
    hasIntro?: boolean;
    hasOutro?: boolean;
    introDurationMs?: number;
    outroDurationMs?: number;
  },
): QualityCheckContext {
  return {
    outputMp4Path: "/out/output.mp4",
    spec: { meta: { resolution: { width: 1920, height: 1080 } } },
    probeResult:
      videoDurationSec !== undefined
        ? {
            width: 1920,
            height: 1080,
            sar: "1:1",
            videoCodec: "h264",
            pixFmt: "yuv420p",
            containerFormat: "mov,mp4,m4a,3gp,3g2,mj2",
            videoDurationSec,
            audioDurationSec: null,
          }
        : undefined,
    hasIntro: opts?.hasIntro,
    hasOutro: opts?.hasOutro,
    introDurationMs: opts?.introDurationMs,
    outroDurationMs: opts?.outroDurationMs,
  };
}

describe("checkIntroOutro", () => {
  it("passes when video duration exceeds intro+outro minimums", () => {
    const results = checkIntroOutro(ctx(10, { hasIntro: true, hasOutro: true }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("fails when video is shorter than intro duration", () => {
    const results = checkIntroOutro(ctx(1.5, { hasIntro: true }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("fail");
    expect(results[0]!.message).toMatch(/intro/i);
  });

  it("passes (skip) when hasIntro and hasOutro are both undefined", () => {
    const results = checkIntroOutro(ctx(10));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.message).toMatch(/skip/i);
  });

  it("has phase post-render and checkName timeline:intro-outro", () => {
    const results = checkIntroOutro(ctx(10, { hasIntro: true, hasOutro: true }));
    expect(results[0]!.phase).toBe("post-render");
    expect(results[0]!.checkName).toBe("timeline:intro-outro");
  });

  it("handles video with only intro (no outro)", () => {
    const results = checkIntroOutro(ctx(3, { hasIntro: true }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("handles video with only outro (no intro)", () => {
    const results = checkIntroOutro(ctx(3, { hasOutro: true }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("fails when video with only outro is too short", () => {
    const results = checkIntroOutro(ctx(1.5, { hasOutro: true }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("fail");
    expect(results[0]!.message).toMatch(/outro/i);
  });

  it("fails when video with intro+outro is shorter than combined minimum", () => {
    const results = checkIntroOutro(ctx(3.5, { hasIntro: true, hasOutro: true }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("fail");
  });

  it("returns warn when probeResult is undefined", () => {
    const results = checkIntroOutro(ctx(undefined, { hasIntro: true }));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
    expect(results[0]!.message).toMatch(/skip/i);
  });

  it("uses custom intro/outro durations when provided", () => {
    // 3s custom intro, video is only 2s → should fail
    const results = checkIntroOutro(ctx(2, { hasIntro: true, introDurationMs: 3000 }));
    expect(results[0]!.status).toBe("fail");
  });

  it("passes at exact boundary of intro+outro duration", () => {
    // Default 2s intro + 2s outro = 4s minimum
    const results = checkIntroOutro(ctx(4, { hasIntro: true, hasOutro: true }));
    expect(results[0]!.status).toBe("pass");
  });
});
