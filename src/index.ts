// Spec DSL
export {
  loadSpec,
  validateSpec,
  SpecLoadError,
  serializeSpec,
  SUPPORTED_EXTENSIONS,
} from "./spec/loader.js";
export type { SerializeFormat } from "./spec/loader.js";
export { demoSpecSchema } from "./spec/schema.js";
export { preStepSchema, stepSchema } from "./spec/step-schema.js";
export type {
  DemoSpec,
  Chapter,
  Step,
  Meta,
  RunnerConfig,
  Resolution,
  Branding,
  Pacing,
  PreStep,
} from "./spec/types.js";

// Runner
export { startRunner, createRunnerOptions } from "./runner/runner.js";
export type { RunnerHandle, RunnerOptions } from "./runner/types.js";

// Playback
export { PlaybackEngine } from "./playback/engine.js";
export { PlaybackStepError, NoVisibleChangeError } from "./playback/errors.js";
export { actionHandlers } from "./playback/actions.js";
export { registerCustomSelectApproach } from "./playback/handlers/select-approaches.js";
export type { SelectApproach, SelectApproachFn } from "./playback/handlers/select-approaches.js";
export { runPreSteps } from "./playback/presteps.js";
export {
  checkSelectOverlay,
  checkFilePickerOverlay,
  checkOverlayZIndex,
} from "./playback/overlay-visual-guards.js";
export type { PlaywrightPage, PlaybackContext } from "./playback/actions.js";
export type {
  ActionEvent,
  BoundingBox,
  StepEvidence,
  PlaybackResult,
  PlaybackOptions,
} from "./playback/types.js";
export { ScreenshotCollector } from "./playback/screenshot-collector.js";
export type { ScreenshotCollectorResults } from "./playback/screenshot-collector.js";
export { writeScreenshotArtifacts } from "./playback/screenshot-artifacts.js";
export type {
  ScreenshotArtifactManifest,
  ScreenshotArtifactWriteResult,
} from "./playback/screenshot-artifacts.js";

// Change Detection
export {
  ChangeDetectionOrchestrator,
  DomMutationDetector,
  LayoutDetector,
  ComputedStyleDetector,
  ScreenshotDiffDetector,
  AriaStateDetector,
  HitTestDetector,
  createDetectors,
  KNOWN_DETECTOR_NAMES,
  DEFAULT_CHANGE_DETECTION_CONFIG,
  isInteractiveAction,
} from "./playback/change-detection/index.js";
export type {
  ChangeDetector,
  DetectorSignal,
  ChangeDetectionMode,
  ChangeDetectionConfig,
} from "./playback/change-detection/index.js";

// Capture
export { createRecordingContext, finalizeCapture } from "./capture/recorder.js";
export { writeEventLog, readEventLog } from "./capture/event-log.js";
export {
  buildCaptureEnvironmentManifest,
  buildCaptureVerificationManifest,
  writeCaptureEnvironment,
  writeCaptureVerification,
} from "./capture/manifests.js";
export type { CaptureOptions, CaptureBundle, CaptureGeometrySnapshot } from "./capture/types.js";
export type {
  CaptureEnvironmentManifest,
  CaptureVerificationManifest,
} from "./capture/manifests.js";

// Editor
export { buildTimeline, extendTimelineForNarration } from "./editor/timeline.js";
export { applyTimelineTrim, resolveStartStepIndex, trimSpecFromStepIndex } from "./editor/trim.js";
export { createRenderer, createRendererV2 } from "./editor/renderer.js";
export type {
  Timeline,
  Segment,
  SegmentType,
  ZoomRegion,
  RenderOptions,
  VideoRenderer,
} from "./editor/types.js";
export type { Renderer, RenderArgs, RenderResult } from "./editor/renderer-types.js";

// CLI types
export type { CaptureResult } from "./cli/capture.js";
export type { NarrationSettings } from "./cli/narration.js";

// Narration
export { generateScript } from "./narration/script-generator.js";
export { createTTSProvider } from "./narration/provider.js";
export { mixNarrationAudio, mixPreSynthesizedNarrationAudio } from "./narration/audio-mixer.js";
export {
  preSynthesizeNarration,
  extractNarrationItems,
  buildEstimatedNarrationTiming,
} from "./narration/pre-synthesizer.js";
export { generateVTT, generateSRT } from "./narration/subtitles.js";
export { generateVTTFromTimed, generateSRTFromTimed } from "./narration/subtitles.js";
export { cloneVoice } from "./narration/providers/elevenlabs-clone.js";
export type {
  CloneVoiceOptions,
  CloneVoiceResult,
} from "./narration/providers/elevenlabs-clone.js";
export { loadVoiceConfig, saveVoiceEntry, listVoices } from "./narration/voice-config.js";
export type { VoiceConfig, VoiceEntry } from "./narration/voice-config.js";
export type {
  NarrationSegment,
  TTSOptions,
  TTSProvider,
  NarrationMixResult,
  TimedNarrationSegment,
  ElevenLabsVoiceSettings,
} from "./narration/types.js";
export {
  detectOverlaps,
  renderTimelineView,
  buildTimelineViewInput,
} from "./narration/timeline-view.js";
export type {
  TimelineViewInput,
  TimelineViewResult,
  OverlapInfo,
} from "./narration/timeline-view.js";

export type {
  NarrationSyncMode,
  NarrationSyncConfig,
  SpecNarrationConfig,
  NarrationTimingEntry,
  NarrationTimingMap,
  NarrationPreSynthesisResult,
} from "./utils/narration-sync-types.js";

// Pipeline
export {
  captureFromSpec,
  runFullPipeline,
  prepareNarration,
  synthesizeAudio,
  writeSubtitles,
  extractBranding,
} from "./pipeline.js";
export type { PipelineOptions, CaptureResult as PipelineCaptureResult } from "./pipeline.js";

// Redaction
export { generateBlurStyles } from "./redaction/mask.js";
export { scanForSecrets } from "./redaction/secrets.js";
export type { SecretMatch } from "./redaction/types.js";

// Validation
export { preflight, PreflightError } from "./validation/preflight.js";
export { postflight } from "./validation/postflight.js";
export { attachMonitors, collectIssues } from "./validation/monitor-runner.js";
export { runPhase, registerCheck } from "./validation/registry.js";
export type {
  CheckResult,
  CheckContext,
  CheckPhase,
  CheckSeverity,
  CheckDefinition,
} from "./validation/types.js";
export type { CaptureMonitor, MonitorIssue } from "./validation/monitor-types.js";
export type { CaptureCheckContext } from "./validation/checks/post-capture.js";

// Quality Gate
export {
  probeVideo,
  runQualityGate,
  diffImages,
  countColorPixels,
  checkStepScreenshots,
  checkAssertZeroEffect,
  checkPhantomOverlay,
  checkCursorPosition,
  checkChapterTitles,
  checkFileSizeTrend,
} from "./quality/index.js";
export type {
  QualityGateResult,
  VideoProbeResult,
  QualityCheckContext,
  ManifestEntry,
  PixelDiffResult,
  ColorTarget,
} from "./quality/index.js";

// Utils
export { createLogger, setLogLevel } from "./utils/logger.js";
export type { LogLevel, Logger } from "./utils/logger.js";
