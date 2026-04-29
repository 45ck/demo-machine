import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzeDemoRun,
  type VideoEvaluatorRuntime,
} from "../../src/quality/video-evaluator-adapter.js";
import {
  compareDemoVisualFrames,
  type DemoVisualEvaluatorRuntime,
} from "../../src/quality/video-evaluator-visual-adapter.js";

let tempDir: string | undefined;

async function makeOutputDir(): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "demo-machine-analyze-"));
  await writeFile(join(tempDir, "output.mp4"), "fake video", "utf-8");
  return tempDir;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function createFakeEvaluator(): VideoEvaluatorRuntime & DemoVisualEvaluatorRuntime {
  return {
    runVideoShots: vi.fn(async (input) => {
      const outputDir = String(input["outputDir"]);
      const manifestPath = join(outputDir, "video.shots.json");
      await writeJson(manifestPath, { shots: [] });
      return { manifestPath };
    }),
    runSegmentStoryboard: vi.fn(async (input) => {
      const storyboardOutputDir = String(input["storyboardOutputDir"]);
      await mkdir(storyboardOutputDir, { recursive: true });
      const manifestPath = join(storyboardOutputDir, "storyboard.manifest.json");
      await writeJson(manifestPath, { frames: [] });
      return { manifestPath };
    }),
    runStoryboardOcr: vi.fn(async (input) => {
      const outputPath = join(String(input["storyboardDir"]), "storyboard.ocr.json");
      await writeJson(outputPath, { frames: [] });
      return { outputPath };
    }),
    runStoryboardTransitions: vi.fn(async (input) => {
      const outputPath = join(String(input["storyboardDir"]), "storyboard.transitions.json");
      await writeJson(outputPath, { transitions: [] });
      return { outputPath };
    }),
    runSegmentEvidence: vi.fn(async (input) => {
      const manifestPath = String(input["outputPath"]);
      await writeJson(manifestPath, { segments: [] });
      return { manifestPath };
    }),
    runLayoutSafetyReview: vi.fn(async (input) => {
      const reportPath = join(String(input["outputDir"]), "layout-safety.report.json");
      await writeJson(reportPath, { status: "pass" });
      return { reportPath };
    }),
    runDemoVisualReview: vi.fn(async (input) => ({
      report: {
        overallStatus: "pass",
        threshold: Number(input["maxMismatchPercent"]),
        frames: [
          {
            metadata: { status: "pass" },
            mismatchPercent: 0.015,
            leftFramePath: "baseline.png",
            rightFramePath: "current.png",
          },
        ],
      },
    })),
    reviewBundle: vi.fn(async (input) => ({
      bundle: {
        rootDir: String(input["outputDir"]),
        videoPath: join(String(input["outputDir"]), "output.mp4"),
        artifacts: {},
      },
    })),
    packageReviewPrompt: vi.fn(async () => ({ prompt: "# Review\n\nInspect the demo artifacts." })),
  };
}

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("analyzeDemoRun", () => {
  it("generates analyzer artifacts through the video-evaluator boundary", async () => {
    const outputDir = await makeOutputDir();
    const evaluator = createFakeEvaluator();

    const result = await analyzeDemoRun({ outputDir, evaluator });

    expect(result.outputDir).toBe(outputDir);
    expect(result.videoPath).toBe(join(outputDir, "output.mp4"));
    expect(Object.keys(result.artifacts).sort()).toEqual([
      "layout-safety.report.json",
      "review-bundle.json",
      "review-prompt.md",
      "segment-storyboard/storyboard.manifest.json",
      "segment-storyboard/storyboard.ocr.json",
      "segment-storyboard/storyboard.transitions.json",
      "segment.evidence.json",
      "video.shots.json",
    ]);
    await expect(readFile(join(outputDir, "review-prompt.md"), "utf-8")).resolves.toContain(
      "Inspect the demo artifacts.",
    );
  });

  it("fails clearly when no video exists in the output directory", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "demo-machine-analyze-empty-"));
    const evaluator = createFakeEvaluator();

    await expect(analyzeDemoRun({ outputDir: tempDir, evaluator })).rejects.toThrow(
      "No video found for analyzer input",
    );
  });

  it("can skip OCR-backed analyzer steps", async () => {
    const outputDir = await makeOutputDir();
    const evaluator = createFakeEvaluator();

    await analyzeDemoRun({ outputDir, evaluator, runOcr: false });

    expect(evaluator.runStoryboardOcr).not.toHaveBeenCalled();
    expect(evaluator.runStoryboardTransitions).not.toHaveBeenCalled();
  });

  it("writes demo capture screenshot evidence for packaged review prompts", async () => {
    const outputDir = await makeOutputDir();
    const evaluator = createFakeEvaluator();
    await mkdir(join(outputDir, "screenshots"), { recursive: true });
    await writeJson(join(outputDir, "metadata.json"), {
      schemaVersion: 1,
      startTimestamp: 100_000,
      createdAt: "2026-04-29T00:00:00.000Z",
    });
    await writeJson(join(outputDir, "events.json"), [
      { action: "click", selector: "#save", timestamp: 101_200, duration: 300 },
    ]);
    await writeJson(join(outputDir, "screenshots", "manifest.json"), {
      schemaVersion: 1,
      counts: {
        stepScreenshots: 1,
        assertScreenshotPairs: 1,
        cursorPositions: 0,
        chapterTitleScreenshots: 0,
      },
      stepScreenshots: [{ stepIndex: 0, path: join(outputDir, "screenshots", "step.png") }],
      assertScreenshotPairs: [
        {
          stepIndex: 0,
          beforePath: join(outputDir, "screenshots", "before.png"),
          afterPath: join(outputDir, "screenshots", "after.png"),
        },
      ],
      cursorPositions: [],
      chapterTitleScreenshots: [],
    });

    const result = await analyzeDemoRun({ outputDir, evaluator });
    const captureEvidence = JSON.parse(
      await readFile(join(outputDir, "demo-capture-evidence.json"), "utf-8"),
    ) as {
      events: unknown[];
      screenshotEvidence: Array<{ framePath?: string; timestampSeconds?: number }>;
      artifacts?: Array<{ name?: string }>;
      summary?: { screenshotCount?: number };
    };

    expect(result.artifacts["demo-capture-evidence.json"]).toBe(
      join(outputDir, "demo-capture-evidence.json"),
    );
    expect(captureEvidence.events).toHaveLength(1);
    expect(captureEvidence.screenshotEvidence).toHaveLength(3);
    expect(captureEvidence.screenshotEvidence[0]?.timestampSeconds).toBe(1.2);
    expect(captureEvidence.summary?.screenshotCount).toBe(3);
    expect(captureEvidence.artifacts?.some((artifact) => artifact.name === "metadata.json")).toBe(
      true,
    );
  });

  it("adapts legacy visual diff threshold percentages to evaluator ratios", async () => {
    const outputDir = await makeOutputDir();
    const evaluator = createFakeEvaluator();

    const result = await compareDemoVisualFrames({
      evaluator,
      thresholdPercent: 3,
      frames: [
        {
          id: "frame-01.png",
          baselineFramePath: join(outputDir, "baseline.png"),
          currentFramePath: join(outputDir, "current.png"),
        },
      ],
    });

    expect(evaluator.runDemoVisualReview).toHaveBeenCalledWith(
      expect.objectContaining({
        maxMismatchPercent: 0.03,
        pixelmatchThreshold: 0.1,
        missingBaselineStatus: "skip",
      }),
    );
    expect(result.report.threshold).toBe(0.03);
  });
});
