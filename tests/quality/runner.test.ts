import { describe, it, expect, vi } from "vitest";
import type { VideoProbeResult, QualityCheckContext } from "../../src/quality/types.js";
import type { CheckResult } from "../../src/validation/types.js";

const validProbe: VideoProbeResult = {
  width: 1920,
  height: 1080,
  sar: "1:1",
  videoCodec: "h264",
  pixFmt: "yuv420p",
  containerFormat: "mov,mp4,m4a,3gp,3g2,mj2",
  videoDurationSec: 10,
  audioDurationSec: 10,
};

describe("runQualityGate", () => {
  it("runs all checks and returns combined results", async () => {
    const { runQualityGate } = await import("../../src/quality/runner.js");

    const result = await runQualityGate({
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      probeVideoFn: async () => validProbe,
      statFileFn: async () => 5_000_000,
    });

    // Should have results from resolution (2), av-duration (1), codec (3), file-size (1)
    expect(result.results.length).toBeGreaterThanOrEqual(7);
  });

  it("all results have phase post-render", async () => {
    const { runQualityGate } = await import("../../src/quality/runner.js");

    const result = await runQualityGate({
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      probeVideoFn: async () => validProbe,
      statFileFn: async () => 5_000_000,
    });

    for (const r of result.results) {
      expect(r.phase).toBe("post-render");
    }
  });

  it("probes video only once even though multiple checks use the probe", async () => {
    const probeFn = vi.fn(async () => validProbe);

    const { runQualityGate } = await import("../../src/quality/runner.js");
    await runQualityGate({
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      probeVideoFn: probeFn,
      statFileFn: async () => 5_000_000,
    });

    expect(probeFn).toHaveBeenCalledOnce();
  });

  it("stats file only once", async () => {
    const statFn = vi.fn(async () => 5_000_000);

    const { runQualityGate } = await import("../../src/quality/runner.js");
    await runQualityGate({
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      probeVideoFn: async () => validProbe,
      statFileFn: statFn,
    });

    expect(statFn).toHaveBeenCalledOnce();
  });

  it("hasFailures is false when all checks pass", async () => {
    const { runQualityGate } = await import("../../src/quality/runner.js");

    const result = await runQualityGate({
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      probeVideoFn: async () => validProbe,
      statFileFn: async () => 5_000_000,
    });

    expect(result.hasFailures).toBe(false);
  });

  it("hasFailures is true when any check fails", async () => {
    const { runQualityGate } = await import("../../src/quality/runner.js");

    const badProbe = { ...validProbe, width: 800 };
    const result = await runQualityGate({
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      probeVideoFn: async () => badProbe,
      statFileFn: async () => 5_000_000,
    });

    expect(result.hasFailures).toBe(true);
  });

  it("continues running remaining checks when probeVideo throws (fault isolation)", async () => {
    const { runQualityGate } = await import("../../src/quality/runner.js");

    const result = await runQualityGate({
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      probeVideoFn: async () => {
        throw new Error("ffprobe not installed");
      },
      statFileFn: async () => 5_000_000,
    });

    // Should have a warn/fail result for the probe failure
    // and file-size check should still have run
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    const fileSizeResult = result.results.find((r) => r.checkName === "file-size-budget");
    expect(fileSizeResult).toBeDefined();
  });

  it("includes manifest entry when provided", async () => {
    const { runQualityGate } = await import("../../src/quality/runner.js");

    const result = await runQualityGate({
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      manifestEntry: { slug: "test", maxOutputBytes: 1_000 },
      probeVideoFn: async () => validProbe,
      statFileFn: async () => 5_000_000,
    });

    // File size check should fail (5MB > 1KB budget)
    const fileSizeResult = result.results.find((r) => r.checkName === "file-size-budget");
    expect(fileSizeResult!.status).toBe("fail");
  });

  it("emits probe-video warn with error message when probeVideoFn throws", async () => {
    const { runQualityGate } = await import("../../src/quality/runner.js");

    const result = await runQualityGate({
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      probeVideoFn: async () => {
        throw new Error("ffprobe not installed");
      },
      statFileFn: async () => 5_000_000,
    });

    const probeWarn = result.results.find((r) => r.checkName === "probe-video");
    expect(probeWarn).toBeDefined();
    expect(probeWarn!.status).toBe("warn");
    expect(probeWarn!.message).toContain("ffprobe not installed");
  });

  it("emits stat-file warn and continues when statFileFn throws", async () => {
    const { runQualityGate } = await import("../../src/quality/runner.js");

    const result = await runQualityGate({
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      manifestEntry: { slug: "test", maxOutputBytes: 10_000_000 },
      probeVideoFn: async () => validProbe,
      statFileFn: async () => {
        throw new Error("ENOENT");
      },
    });

    const statWarn = result.results.find((r) => r.checkName === "stat-file");
    expect(statWarn).toBeDefined();
    expect(statWarn!.status).toBe("warn");
    // Probe-dependent checks should still have run
    expect(result.results.some((r) => r.checkName === "resolution:dimensions")).toBe(true);
    // File-size check should warn about stat failure
    const fsResult = result.results.find((r) => r.checkName === "file-size-budget");
    expect(fsResult!.status).toBe("warn");
  });

  it("returns expected check names in order", async () => {
    const { runQualityGate } = await import("../../src/quality/runner.js");

    const result = await runQualityGate({
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      probeVideoFn: async () => validProbe,
      statFileFn: async () => 5_000_000,
    });

    const names = result.results.map((r) => r.checkName);
    expect(names).toEqual(
      expect.arrayContaining([
        "resolution:dimensions",
        "resolution:sar",
        "av-duration-parity",
        "codec:video-codec",
        "codec:pixel-format",
        "codec:container",
        "file-size-budget",
      ]),
    );
  });

  it("catches throwing check and continues running remaining checks (safeRun)", async () => {
    // We can trigger an internal check error by passing crafted data that causes
    // a check to throw. Use a mock that makes the narration ordering check throw
    // by providing a narrationSegments with a getter that throws.
    const { runQualityGate } = await import("../../src/quality/runner.js");

    // Create a narrationSegments proxy that throws when iterated
    const badSegments = new Proxy(
      [] as Array<{ actionIndex: number; startMs: number; text: string }>,
      {
        get(target, prop) {
          if (prop === "length") return 1;
          if (prop === Symbol.iterator) {
            return function* () {
              throw new Error("boom from check");
            };
          }
          return Reflect.get(target, prop);
        },
      },
    );

    const result = await runQualityGate({
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      probeVideoFn: async () => validProbe,
      statFileFn: async () => 5_000_000,
      narrationSegments: badSegments,
      events: [{ action: "click", timestamp: 1000, duration: 200 }],
    });

    // The narration check should have been caught and produced an internal-error warn
    const internalError = result.results.find((r) => r.checkName === "internal-error");
    expect(internalError).toBeDefined();
    expect(internalError!.status).toBe("warn");
    expect(internalError!.message).toContain("boom from check");

    // Other checks should still have run
    const fileSizeResult = result.results.find((r) => r.checkName === "file-size-budget");
    expect(fileSizeResult).toBeDefined();
    const resResult = result.results.find((r) => r.checkName === "resolution:dimensions");
    expect(resResult).toBeDefined();
  });
});
