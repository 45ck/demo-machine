import { access, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonObject = Record<string, unknown>;

interface ReviewBundleResult {
  bundle?: {
    rootDir?: string | null;
    videoPath?: string | null;
    artifacts?: Record<string, string>;
  };
}

interface PackageReviewPromptResult {
  prompt?: string;
}

interface PathResult {
  manifestPath?: string;
  outputPath?: string;
  reportPath?: string;
}

export interface VideoEvaluatorRuntime {
  runVideoShots(input: JsonObject): Promise<PathResult>;
  runSegmentStoryboard(input: JsonObject): Promise<PathResult>;
  runStoryboardOcr(input: JsonObject): Promise<PathResult>;
  runStoryboardTransitions(input: JsonObject): Promise<PathResult>;
  runSegmentEvidence(input: JsonObject): Promise<PathResult>;
  runLayoutSafetyReview(input: JsonObject): Promise<PathResult>;
  reviewBundle(input: JsonObject): Promise<ReviewBundleResult>;
  packageReviewPrompt(input: JsonObject): Promise<PackageReviewPromptResult>;
}

export interface AnalyzeDemoRunParams {
  outputDir?: string | undefined;
  latestPointerRoot?: string | undefined;
  videoPath?: string | undefined;
  specPath?: string | undefined;
  layoutPath?: string | undefined;
  sceneThreshold?: number | undefined;
  minShotDurationSeconds?: number | undefined;
  framesPerSegment?: number | undefined;
  runOcr?: boolean | undefined;
  evaluator?: VideoEvaluatorRuntime | undefined;
}

export interface AnalyzeDemoRunResult {
  outputDir: string;
  videoPath: string;
  artifacts: Record<string, string>;
}

interface AnalyzerContext {
  evaluator: VideoEvaluatorRuntime;
  params: AnalyzeDemoRunParams;
  outputDir: string;
  videoPath: string;
  artifacts: Record<string, string>;
}

const REQUIRED_EXPORTS = [
  "runVideoShots",
  "runSegmentStoryboard",
  "runStoryboardOcr",
  "runStoryboardTransitions",
  "runSegmentEvidence",
  "runLayoutSafetyReview",
  "reviewBundle",
  "packageReviewPrompt",
] as const;

function getEvaluatorImportCandidates(): string[] {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return [
    "@45ck/video-evaluator",
    pathToFileURL(resolve(moduleDir, "../../../video-evaluator/dist/index.js")).href,
  ];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadVideoEvaluator(): Promise<VideoEvaluatorRuntime> {
  const errors: string[] = [];
  for (const specifier of getEvaluatorImportCandidates()) {
    try {
      return validateVideoEvaluator(await import(specifier), specifier);
    } catch (err) {
      errors.push(`${specifier}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`Could not load @45ck/video-evaluator. Tried: ${errors.join("; ")}`);
}

function validateVideoEvaluator(loaded: unknown, source: string): VideoEvaluatorRuntime {
  const runtime = loaded as Partial<VideoEvaluatorRuntime>;
  const missing = REQUIRED_EXPORTS.filter((name) => typeof runtime[name] !== "function");
  if (missing.length > 0) {
    throw new Error(
      `${source} is missing required video-evaluator export(s): ${missing.join(", ")}`,
    );
  }
  return runtime as VideoEvaluatorRuntime;
}

async function writeJson(path: string, value: unknown): Promise<string> {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
  return path;
}

async function writeText(path: string, value: string): Promise<string> {
  await writeFile(path, value.endsWith("\n") ? value : `${value}\n`, "utf-8");
  return path;
}

function pathFromResult(result: PathResult, key: keyof PathResult, fallback: string): string {
  const value = result[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function resolveRootDir(params: AnalyzeDemoRunParams, bundle: ReviewBundleResult): string | null {
  if (params.outputDir) return resolve(params.outputDir);
  const rootDir = bundle.bundle?.rootDir;
  if (typeof rootDir === "string" && rootDir.length > 0) return resolve(rootDir);
  if (params.videoPath) return dirname(resolve(params.videoPath));
  return null;
}

function resolveVideoPath(params: AnalyzeDemoRunParams, bundle: ReviewBundleResult): string | null {
  if (params.videoPath) return resolve(params.videoPath);
  const videoPath = bundle.bundle?.videoPath;
  return typeof videoPath === "string" && videoPath.length > 0 ? resolve(videoPath) : null;
}

function buildReviewInput(params: AnalyzeDemoRunParams): JsonObject {
  return {
    ...(params.outputDir ? { outputDir: resolve(params.outputDir) } : {}),
    ...(params.latestPointerRoot ? { latestPointerRoot: resolve(params.latestPointerRoot) } : {}),
    ...(params.videoPath ? { videoPath: resolve(params.videoPath) } : {}),
    includePromptHints: true,
  };
}

async function resolveAnalyzerContext(params: AnalyzeDemoRunParams): Promise<AnalyzerContext> {
  const evaluator = params.evaluator ?? (await loadVideoEvaluator());
  const initialReview = await evaluator.reviewBundle(buildReviewInput(params));
  const outputDir = resolveRootDir(params, initialReview);
  if (!outputDir) {
    throw new Error(
      "Could not resolve a demo output directory. Pass an output directory or --latest.",
    );
  }

  const videoPath = resolveVideoPath(params, initialReview);
  if (!videoPath || !(await pathExists(videoPath))) {
    throw new Error(
      `No video found for analyzer input. Expected output.mp4 or video.webm in ${outputDir}.`,
    );
  }

  return { evaluator, params, outputDir, videoPath, artifacts: {} };
}

async function runVideoShotAnalysis(ctx: AnalyzerContext): Promise<void> {
  const { evaluator, params, outputDir, videoPath, artifacts } = ctx;
  const result = await evaluator.runVideoShots({
    videoPath,
    outputDir,
    ...(params.sceneThreshold !== undefined ? { sceneThreshold: params.sceneThreshold } : {}),
    ...(params.minShotDurationSeconds !== undefined
      ? { minShotDurationSeconds: params.minShotDurationSeconds }
      : {}),
    extractRepresentativeFrames: true,
  });
  artifacts["video.shots.json"] = pathFromResult(
    result,
    "manifestPath",
    join(outputDir, "video.shots.json"),
  );
}

async function runSegmentStoryboardAnalysis(ctx: AnalyzerContext): Promise<string> {
  const { evaluator, params, outputDir, videoPath, artifacts } = ctx;
  const storyboardDir = join(outputDir, "segment-storyboard");
  const result = await evaluator.runSegmentStoryboard({
    outputDir,
    videoPath,
    storyboardOutputDir: storyboardDir,
    framesPerSegment: params.framesPerSegment ?? 1,
    format: "jpg",
  });
  artifacts["segment-storyboard/storyboard.manifest.json"] = pathFromResult(
    result,
    "manifestPath",
    join(storyboardDir, "storyboard.manifest.json"),
  );
  return storyboardDir;
}

async function runOcrAnalysis(ctx: AnalyzerContext, storyboardDir: string): Promise<void> {
  const { evaluator, artifacts } = ctx;
  const ocr = await evaluator.runStoryboardOcr({ storyboardDir });
  artifacts["segment-storyboard/storyboard.ocr.json"] = pathFromResult(
    ocr,
    "outputPath",
    join(storyboardDir, "storyboard.ocr.json"),
  );
  const transitions = await evaluator.runStoryboardTransitions({ storyboardDir });
  artifacts["segment-storyboard/storyboard.transitions.json"] = pathFromResult(
    transitions,
    "outputPath",
    join(storyboardDir, "storyboard.transitions.json"),
  );
}

async function runSegmentEvidenceAnalysis(ctx: AnalyzerContext): Promise<void> {
  const { evaluator, outputDir, videoPath, artifacts } = ctx;
  const outputPath = join(outputDir, "segment.evidence.json");
  const result = await evaluator.runSegmentEvidence({ outputDir, videoPath, outputPath });
  artifacts["segment.evidence.json"] = pathFromResult(result, "manifestPath", outputPath);
}

async function runLayoutSafetyAnalysis(ctx: AnalyzerContext, runOcr: boolean): Promise<void> {
  const { evaluator, params, outputDir, videoPath, artifacts } = ctx;
  const result = await evaluator.runLayoutSafetyReview({
    videoPath,
    outputDir,
    ...(params.layoutPath ? { layoutPath: resolve(params.layoutPath) } : {}),
    runOcr,
  });
  artifacts["layout-safety.report.json"] = pathFromResult(
    result,
    "reportPath",
    join(outputDir, "layout-safety.report.json"),
  );
}

async function writeReviewArtifacts(ctx: AnalyzerContext): Promise<void> {
  const { evaluator, params, outputDir, videoPath, artifacts } = ctx;
  const finalReview = await evaluator.reviewBundle({
    outputDir,
    videoPath,
    includePromptHints: true,
  });
  artifacts["review-bundle.json"] = await writeJson(
    join(outputDir, "review-bundle.json"),
    finalReview,
  );

  const packagedPrompt = await evaluator.packageReviewPrompt({
    outputDir,
    videoPath,
    ...(params.specPath ? { specPath: resolve(params.specPath) } : {}),
  });
  if (typeof packagedPrompt.prompt !== "string" || packagedPrompt.prompt.length === 0) {
    throw new Error("@45ck/video-evaluator packageReviewPrompt() did not return a prompt string.");
  }
  artifacts["review-prompt.md"] = await writeText(
    join(outputDir, "review-prompt.md"),
    packagedPrompt.prompt,
  );
}

export async function analyzeDemoRun(params: AnalyzeDemoRunParams): Promise<AnalyzeDemoRunResult> {
  const ctx = await resolveAnalyzerContext(params);
  await runVideoShotAnalysis(ctx);
  const storyboardDir = await runSegmentStoryboardAnalysis(ctx);
  const runOcr = ctx.params.runOcr ?? true;
  if (runOcr) {
    await runOcrAnalysis(ctx, storyboardDir);
  }
  await runSegmentEvidenceAnalysis(ctx);
  await runLayoutSafetyAnalysis(ctx, runOcr);
  await writeReviewArtifacts(ctx);
  return { outputDir: ctx.outputDir, videoPath: ctx.videoPath, artifacts: ctx.artifacts };
}
