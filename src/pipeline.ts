import type { DemoSpec } from "./spec/types.js";
import type { ActionEvent } from "./playback/types.js";
import type { Timeline } from "./editor/types.js";
import type { NarrationPreSynthesisResult } from "./utils/narration-sync-types.js";
import type { TimedNarrationSegment, NarrationMixResult } from "./narration/types.js";
import { createLogger } from "./utils/logger.js";

const log = createLogger("pipeline");

export interface PipelineOptions {
  output: string;
  narration: boolean;
  edit: boolean;
  renderer: string;
  ttsProvider: string;
  ttsVoice?: string | undefined;
  narrationSync?: string | undefined;
  narrationBuffer?: number | undefined;
  headless: boolean;
  /** Select dropdown visual approach: A | B | C (default) | D (custom hook). */
  selectApproach?: "A" | "B" | "C" | "D" | undefined;
  /** Override the directory used to resolve relative asset paths (e.g. upload files).
   * When omitted, `specDir` is derived from `specPath` automatically. */
  specDir?: string | undefined;
}

export interface CaptureResult {
  videoPath: string;
  events: ActionEvent[];
  spec: DemoSpec;
  startTimestamp: number;
  artifacts?:
    | {
        tracePath: string;
        eventLogPath: string;
        metadataPath?: string | undefined;
        environmentPath: string;
        verificationPath: string;
      }
    | undefined;
}

export function extractBranding(
  spec: DemoSpec,
): { logo?: string; colors?: { primary: string; background: string } } | undefined {
  const branding = spec.meta.branding;
  if (!branding) return undefined;
  const result: { logo?: string; colors?: { primary: string; background: string } } = {};
  if (branding.logo) result.logo = branding.logo;
  const colors = branding.colors;
  if (colors?.primary && colors.background) {
    result.colors = { primary: colors.primary, background: colors.background };
  }
  return result;
}

export async function synthesizeAudio(params: {
  spec: DemoSpec;
  events: ActionEvent[];
  startTimestamp: number;
  provider: string;
  voice?: string | undefined;
  bufferMs: number;
  outputDir: string;
}): Promise<NarrationMixResult | undefined> {
  const scriptMod = await import("./narration/script-generator.js");
  const providerMod = await import("./narration/provider.js");
  const mixerMod = await import("./narration/audio-mixer.js");

  const segments = scriptMod.generateScript(
    params.spec.chapters,
    params.events,
    params.startTimestamp,
  );
  const provider = providerMod.createTTSProvider(params.provider);
  const ttsOpts = params.voice ? { voice: params.voice } : {};

  return mixerMod.mixNarrationAudio(
    segments,
    {
      name: provider.name,
      synthesize: (text) => provider.synthesize(text, ttsOpts),
    },
    params.outputDir,
    params.bufferMs,
  );
}

export async function writeSubtitles(params: {
  segments: TimedNarrationSegment[];
  outputDir: string;
}): Promise<void> {
  const subsMod = await import("./narration/subtitles.js");
  const { writeFile } = await import("node:fs/promises");
  const pathMod = await import("node:path");

  await writeFile(
    pathMod.join(params.outputDir, "subtitles.vtt"),
    subsMod.generateVTTFromTimed(params.segments),
    "utf-8",
  );
  await writeFile(
    pathMod.join(params.outputDir, "subtitles.srt"),
    subsMod.generateSRTFromTimed(params.segments),
    "utf-8",
  );
  log.info("Subtitles saved");
}

export async function prepareNarration(params: {
  spec: DemoSpec;
  events: ActionEvent[];
  startTimestamp: number;
  timeline: Timeline;
  provider: string;
  voice?: string | undefined;
  bufferMs: number;
  outputDir: string;
  preSynth?: NarrationPreSynthesisResult | undefined;
}): Promise<{
  timeline: Timeline;
  audioPath?: string | undefined;
  extendToMs?: number | undefined;
  timedSegments?: TimedNarrationSegment[] | undefined;
}> {
  const timelineMod = await import("./editor/timeline.js");

  const narrationResult = await synthesizeAudio({
    spec: params.spec,
    events: params.events,
    startTimestamp: params.startTimestamp,
    provider: params.provider,
    voice: params.voice,
    bufferMs: params.bufferMs,
    outputDir: params.outputDir,
  });

  if (!narrationResult) return { timeline: params.timeline };

  const originalDurationMs = params.timeline.totalDurationMs;
  const extended = timelineMod.extendTimelineForNarration(
    params.timeline,
    narrationResult.totalDurationMs,
  );

  return {
    timeline: extended,
    audioPath: narrationResult.audioPath,
    timedSegments: narrationResult.segments,
    extendToMs:
      narrationResult.totalDurationMs > originalDurationMs
        ? narrationResult.totalDurationMs
        : undefined,
  };
}

function toGlobalOptions(opts: PipelineOptions): import("./cli/options.js").GlobalOptions {
  return {
    output: opts.output,
    narration: opts.narration,
    edit: opts.edit,
    renderer: opts.renderer,
    ttsProvider: opts.ttsProvider,
    ttsVoice: opts.ttsVoice,
    narrationSync: opts.narrationSync ?? "manual",
    narrationBuffer: opts.narrationBuffer ?? 500,
    verbose: false,
    headless: opts.headless,
    strictGeometry: false,
    selectApproach: opts.selectApproach,
    trimStartMs: 0,
    timeline: false,
  };
}

export async function captureFromSpec(
  specPath: string,
  opts: PipelineOptions,
): Promise<CaptureResult> {
  const { loadSpec } = await import("./spec/loader.js");
  const { resolveNarrationSettings } = await import("./cli/narration.js");
  const captureMod = await import("./cli/capture.js");

  const spec = await loadSpec(specPath);
  const globalOpts = toGlobalOptions(opts);
  const settings = resolveNarrationSettings({
    spec,
    opts: globalOpts,
    getOptionSource: () => undefined,
  });

  const bundle = await captureMod.captureFromSpec({
    spec,
    specPath,
    ...(opts.specDir !== undefined ? { specDir: opts.specDir } : {}),
    opts: globalOpts,
    settings,
  });

  return {
    videoPath: bundle.videoPath,
    events: bundle.events,
    spec: bundle.spec,
    startTimestamp: bundle.startTimestamp,
    artifacts: bundle.artifacts,
  };
}

export async function runFullPipeline(specPath: string, opts: PipelineOptions): Promise<void> {
  const { loadSpec } = await import("./spec/loader.js");
  const { resolveNarrationSettings } = await import("./cli/narration.js");
  const pipelineMod = await import("./cli/pipeline.js");

  const spec = await loadSpec(specPath);
  const globalOpts = toGlobalOptions(opts);
  const settings = resolveNarrationSettings({
    spec,
    opts: globalOpts,
    getOptionSource: () => undefined,
  });

  await pipelineMod.runFullPipeline({
    spec,
    specPath,
    ...(opts.specDir !== undefined ? { specDir: opts.specDir } : {}),
    opts: globalOpts,
    settings,
  });
}
