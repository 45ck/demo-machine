import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DemoSpec } from "../../src/spec/types.js";
import type { CheckResult } from "../../src/validation/types.js";

vi.mock("../../src/quality/runner.js", () => ({
  runQualityGate: vi.fn(),
}));

const spec = {
  meta: { title: "Pipeline Quality Test", resolution: { width: 1920, height: 1080 } },
  chapters: [],
} as unknown as DemoSpec;

async function mockedRunner() {
  const mod = await import("../../src/quality/runner.js");
  return vi.mocked(mod.runQualityGate);
}

describe("runPostRenderQualityGate", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it("resolves when the quality gate has warnings but no failures", async () => {
    const runQualityGate = await mockedRunner();
    const warn: CheckResult = {
      phase: "post-render",
      checkName: "visual:chapter-title",
      status: "warn",
      message: "Fewer than 2 chapter title screenshots provided (skipped)",
    };
    runQualityGate.mockResolvedValueOnce({
      results: [warn],
      hasFailures: false,
      durationMs: 7,
    });
    const { runPostRenderQualityGate } = await import("../../src/cli/pipeline.js");

    await expect(
      runPostRenderQualityGate({ outputPath: "output.mp4", spec }),
    ).resolves.toBeUndefined();
  });

  it("rejects when any post-render quality check fails", async () => {
    const runQualityGate = await mockedRunner();
    const fail: CheckResult = {
      phase: "post-render",
      checkName: "codec:video-codec",
      status: "fail",
      message: "Expected h264, got vp9",
    };
    runQualityGate.mockResolvedValueOnce({
      results: [fail],
      hasFailures: true,
      durationMs: 9,
    });
    const { runPostRenderQualityGate } = await import("../../src/cli/pipeline.js");

    await expect(runPostRenderQualityGate({ outputPath: "output.mp4", spec })).rejects.toThrow(
      "Quality gate failed: 1 check(s) failed out of 1",
    );
  });

  it("rejects when the quality gate cannot run", async () => {
    const runQualityGate = await mockedRunner();
    runQualityGate.mockRejectedValueOnce(new Error("ffprobe missing"));
    const { runPostRenderQualityGate } = await import("../../src/cli/pipeline.js");

    await expect(runPostRenderQualityGate({ outputPath: "output.mp4", spec })).rejects.toThrow(
      "Quality gate failed to run: ffprobe missing",
    );
  });
});
