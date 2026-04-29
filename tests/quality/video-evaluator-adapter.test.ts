import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzeDemoRun,
  type VideoEvaluatorRuntime,
} from "../../src/quality/video-evaluator-adapter.js";

let tempDir: string | undefined;

async function makeOutputDir(): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "demo-machine-analyze-"));
  await writeFile(join(tempDir, "output.mp4"), "fake video", "utf-8");
  return tempDir;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function createFakeEvaluator(): VideoEvaluatorRuntime {
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
});
