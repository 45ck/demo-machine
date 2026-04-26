import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pipeline-quality-"));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
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
    const verificationPath = join(tempDir, "verification.json");
    await writeFile(
      verificationPath,
      JSON.stringify({ schemaVersion: 1, artifacts: {}, checks: {} }, null, 2),
      "utf8",
    );

    const result = await runPostRenderQualityGate({
      outputPath: "output.mp4",
      outputDir: tempDir,
      verificationPath,
      spec,
    });

    expect(result).toEqual({
      qualityReportPath: join(tempDir, "quality.json"),
      status: "warn",
    });

    const quality = JSON.parse(await readFile(join(tempDir, "quality.json"), "utf8")) as {
      summary: Record<string, number>;
    };
    expect(quality.summary["warn"]).toBe(1);
    const verification = JSON.parse(await readFile(verificationPath, "utf8")) as {
      artifacts: { qualityReportPath?: string };
      checks: { postRenderQualityPassed?: boolean; postRenderQualityStatus?: string };
    };
    expect(verification.artifacts.qualityReportPath).toBe(join(tempDir, "quality.json"));
    expect(verification.checks.postRenderQualityPassed).toBe(true);
    expect(verification.checks.postRenderQualityStatus).toBe("warn");
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

    await expect(
      runPostRenderQualityGate({ outputPath: "output.mp4", outputDir: tempDir, spec }),
    ).rejects.toThrow("Quality gate failed: 1 check(s) failed out of 1");
    const quality = JSON.parse(await readFile(join(tempDir, "quality.json"), "utf8")) as {
      hasFailures: boolean;
    };
    expect(quality.hasFailures).toBe(true);
  });

  it("rejects when the quality gate cannot run", async () => {
    const runQualityGate = await mockedRunner();
    runQualityGate.mockRejectedValueOnce(new Error("ffprobe missing"));
    const { runPostRenderQualityGate } = await import("../../src/cli/pipeline.js");

    await expect(
      runPostRenderQualityGate({ outputPath: "output.mp4", outputDir: tempDir, spec }),
    ).rejects.toThrow("Quality gate failed to run: ffprobe missing");
    const quality = JSON.parse(await readFile(join(tempDir, "quality.json"), "utf8")) as {
      status: string;
      error?: { message: string };
    };
    expect(quality.status).toBe("fail");
    expect(quality.error?.message).toBe("ffprobe missing");
  });

  it("passes events to quality gate even when narration segments are absent", async () => {
    const runQualityGate = await mockedRunner();
    runQualityGate.mockResolvedValueOnce({
      results: [],
      hasFailures: false,
      durationMs: 1,
    });
    const { runPostRenderQualityGate } = await import("../../src/cli/pipeline.js");

    await runPostRenderQualityGate({
      outputPath: "output.mp4",
      outputDir: tempDir,
      spec,
      events: [{ action: "click", timestamp: 1_500, duration: 200 }],
      startTimestamp: 1_000,
    });

    expect(runQualityGate).toHaveBeenCalledWith(
      expect.objectContaining({
        events: [{ action: "click", timestamp: 500, duration: 200 }],
        narrationSegments: [],
      }),
    );
  });
});
