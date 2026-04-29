import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function evaluatorImportCandidates() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  return [
    "@45ck/video-evaluator",
    pathToFileURL(resolve(scriptDir, "../../video-evaluator/dist/index.js")).href,
  ];
}

async function loadVideoEvaluatorVisualRuntime() {
  const errors = [];
  for (const specifier of evaluatorImportCandidates()) {
    try {
      const loaded = await import(specifier);
      if (typeof loaded.runDemoVisualReview !== "function") {
        throw new Error("missing runDemoVisualReview export");
      }
      return loaded;
    } catch (err) {
      errors.push(`${specifier}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(
    `Could not load @45ck/video-evaluator visual primitives. Tried: ${errors.join("; ")}`,
  );
}

function thresholdRatioFromPercent(thresholdPercent) {
  if (!Number.isFinite(thresholdPercent) || thresholdPercent < 0) {
    throw new Error(`Invalid visual diff threshold percent: ${String(thresholdPercent)}`);
  }
  return thresholdPercent / 100;
}

export async function reviewDemoVisualFramesWithPercent(params) {
  const evaluator = params.evaluator ?? (await loadVideoEvaluatorVisualRuntime());
  return evaluator.runDemoVisualReview({
    frames: params.frames,
    ...(params.baselineDir ? { baselineDir: params.baselineDir } : {}),
    ...(params.currentDir ? { currentDir: params.currentDir } : {}),
    ...(params.outputPath ? { outputPath: params.outputPath } : {}),
    mode: params.mode ?? "compare",
    pixelmatchThreshold: params.pixelmatchThreshold ?? 0.1,
    maxMismatchPercent: thresholdRatioFromPercent(params.thresholdPercent ?? 2),
    missingBaselineStatus: params.missingBaselineStatus ?? "skip",
  });
}

export function frameDiffPercent(frame) {
  const ratio = typeof frame?.mismatchPercent === "number" ? frame.mismatchPercent : 0;
  return Number((ratio * 100).toFixed(2));
}

export function frameStatus(frame) {
  const status = frame?.metadata?.status;
  return typeof status === "string" ? status : "skip";
}
