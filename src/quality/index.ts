export { probeVideo } from "./ffprobe.js";
export { runQualityGate } from "./runner.js";
export type { QualityGateResult } from "./runner.js";
export type { VideoProbeResult, QualityCheckContext, ManifestEntry } from "./types.js";
export { diffImages, countColorPixels } from "./visual-diff.js";
export type { PixelDiffResult, ColorTarget } from "./visual-diff.js";
export { checkStepScreenshots } from "./checks/visual/step-screenshot.js";
export { checkAssertZeroEffect } from "./checks/visual/assert-zero-effect.js";
export { checkPhantomOverlay } from "./checks/visual/phantom-overlay.js";
export { checkCursorPosition } from "./checks/visual/cursor-position.js";
export { checkChapterTitles } from "./checks/visual/chapter-title.js";
export { checkFileSizeTrend } from "./checks/file-size-trend.js";
export { analyzeDemoRun } from "./video-evaluator-adapter.js";
export { compareDemoVisualFrames } from "./video-evaluator-visual-adapter.js";
export type {
  AnalyzeDemoRunParams,
  AnalyzeDemoRunResult,
  VideoEvaluatorRuntime,
} from "./video-evaluator-adapter.js";
export type {
  CompareDemoVisualFramesParams,
  DemoVisualEvaluatorRuntime,
  DemoVisualReviewResult,
} from "./video-evaluator-visual-adapter.js";
