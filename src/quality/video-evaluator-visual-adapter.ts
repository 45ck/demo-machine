import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonObject = Record<string, unknown>;

interface VisualFrameRequest {
  id?: string;
  baselineFramePath?: string;
  currentFramePath: string;
  timestampSeconds?: number;
}

export interface DemoVisualReviewResult {
  reportPath?: string;
  report: {
    overallStatus?: string;
    threshold?: number;
    frames?: Array<{
      index?: number;
      timestampSeconds?: number;
      leftFramePath?: string;
      rightFramePath?: string;
      mismatchPixelCount?: number;
      totalPixelCount?: number;
      mismatchPercent?: number;
      metadata?: Record<string, unknown>;
    }>;
    summary?: Record<string, unknown>;
    diagnostics?: Array<{
      code?: string;
      message?: string;
      severity?: string;
      metadata?: Record<string, unknown>;
    }>;
    metadata?: Record<string, unknown>;
  };
}

export interface DemoVisualEvaluatorRuntime {
  runDemoVisualReview(input: JsonObject): Promise<DemoVisualReviewResult>;
}

export interface CompareDemoVisualFramesParams {
  frames: VisualFrameRequest[];
  baselineDir?: string | undefined;
  currentDir?: string | undefined;
  outputPath?: string | undefined;
  mode?: "compare" | "update" | undefined;
  thresholdPercent?: number | undefined;
  pixelmatchThreshold?: number | undefined;
  missingBaselineStatus?: "pass" | "warn" | "fail" | "skip" | undefined;
  evaluator?: DemoVisualEvaluatorRuntime | undefined;
}

function getEvaluatorImportCandidates(): string[] {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return [
    "@45ck/video-evaluator",
    pathToFileURL(resolve(moduleDir, "../../../video-evaluator/dist/index.js")).href,
  ];
}

async function loadVisualEvaluator(): Promise<DemoVisualEvaluatorRuntime> {
  const errors: string[] = [];
  for (const specifier of getEvaluatorImportCandidates()) {
    try {
      const loaded = (await import(specifier)) as Partial<DemoVisualEvaluatorRuntime>;
      if (typeof loaded.runDemoVisualReview !== "function") {
        throw new Error("missing required runDemoVisualReview export");
      }
      return loaded as DemoVisualEvaluatorRuntime;
    } catch (err) {
      errors.push(`${specifier}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(
    `Could not load @45ck/video-evaluator visual adapter. Tried: ${errors.join("; ")}`,
  );
}

function thresholdRatioFromLegacyPercent(thresholdPercent: number | undefined): number {
  const value = thresholdPercent ?? 2;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid visual diff threshold percent: ${String(thresholdPercent)}`);
  }
  return value / 100;
}

export async function compareDemoVisualFrames(
  params: CompareDemoVisualFramesParams,
): Promise<DemoVisualReviewResult> {
  const evaluator = params.evaluator ?? (await loadVisualEvaluator());
  return evaluator.runDemoVisualReview({
    frames: params.frames.map((frame) => ({
      ...frame,
      ...(frame.baselineFramePath ? { baselineFramePath: resolve(frame.baselineFramePath) } : {}),
      currentFramePath: resolve(frame.currentFramePath),
    })),
    ...(params.baselineDir ? { baselineDir: resolve(params.baselineDir) } : {}),
    ...(params.currentDir ? { currentDir: resolve(params.currentDir) } : {}),
    ...(params.outputPath ? { outputPath: resolve(params.outputPath) } : {}),
    mode: params.mode ?? "compare",
    pixelmatchThreshold: params.pixelmatchThreshold ?? 0.1,
    maxMismatchPercent: thresholdRatioFromLegacyPercent(params.thresholdPercent),
    missingBaselineStatus: params.missingBaselineStatus ?? "skip",
  });
}
