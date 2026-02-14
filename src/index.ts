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
export type {
  DemoSpec,
  Chapter,
  Step,
  Meta,
  RunnerConfig,
  Resolution,
  Branding,
  Pacing,
} from "./spec/types.js";

// Runner
export { startRunner, createRunnerOptions } from "./runner/runner.js";
export type { RunnerHandle, RunnerOptions } from "./runner/types.js";

// Playback
export { PlaybackEngine } from "./playback/engine.js";
export { actionHandlers } from "./playback/actions.js";
export type { PlaywrightPage, PlaybackContext } from "./playback/actions.js";
export type {
  ActionEvent,
  BoundingBox,
  PlaybackResult,
  PlaybackOptions,
} from "./playback/types.js";

// Capture
export { createRecordingContext, finalizeCapture } from "./capture/recorder.js";
export { writeEventLog, readEventLog } from "./capture/event-log.js";
export type { CaptureOptions, CaptureBundle } from "./capture/types.js";

// Editor
export { buildTimeline, extendTimelineForNarration } from "./editor/timeline.js";
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

// Narration
export { generateScript } from "./narration/script-generator.js";
export { createTTSProvider } from "./narration/provider.js";
export { mixNarrationAudio } from "./narration/audio-mixer.js";
export { generateVTT, generateSRT } from "./narration/subtitles.js";
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

// Redaction
export { generateBlurStyles } from "./redaction/mask.js";
export { scanForSecrets } from "./redaction/secrets.js";
export type { SecretMatch } from "./redaction/types.js";

// Utils
export { createLogger, setLogLevel } from "./utils/logger.js";
export type { LogLevel, Logger } from "./utils/logger.js";
