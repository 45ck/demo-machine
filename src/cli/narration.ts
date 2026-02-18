import type { DemoSpec } from "../spec/types.js";
import type { ActionEvent } from "../playback/types.js";
import type { Timeline } from "../editor/types.js";
import { createLogger } from "../utils/logger.js";
import type {
  NarrationPreSynthesisResult,
  NarrationSyncMode,
} from "../utils/narration-sync-types.js";
import type { TimedNarrationSegment, NarrationMixResult } from "../narration/types.js";
import type { GlobalOptions } from "./options.js";

const log = createLogger("cli:narration");

export interface NarrationSettings {
  enabled: boolean;
  provider: string;
  voice?: string | undefined;
  syncMode: NarrationSyncMode;
  bufferMs: number;
}

function normalizeNarrationSyncMode(mode: string): NarrationSyncMode {
  if (mode === "manual" || mode === "auto-sync" || mode === "warn-only") return mode;
  throw new Error(
    `Invalid narration sync mode "${mode}". Expected: manual | auto-sync | warn-only`,
  );
}

export function resolveNarrationSettings(params: {
  spec: DemoSpec;
  opts: GlobalOptions;
  getOptionSource: (name: string) => string | undefined;
}): NarrationSettings {
  const { spec, opts, getOptionSource } = params;
  const specNarration = spec.narration;
  const src = (name: string): string => getOptionSource(name) ?? "default";
  const isDefault = (name: string): boolean => src(name) === "default";

  const pick = <T>(name: string, specValue: T | undefined, cliValue: T): T => {
    return isDefault(name) ? (specValue ?? cliValue) : cliValue;
  };

  const enabled = opts.narration && specNarration?.enabled !== false;

  const provider = pick("ttsProvider", specNarration?.provider, opts.ttsProvider);

  const voice = isDefault("ttsVoice") ? (specNarration?.voice ?? opts.ttsVoice) : opts.ttsVoice;

  const rawSyncMode = isDefault("narrationSync")
    ? (specNarration?.sync?.mode ?? opts.narrationSync)
    : opts.narrationSync;
  const syncMode = normalizeNarrationSyncMode(rawSyncMode);

  const rawBuffer = isDefault("narrationBuffer")
    ? (specNarration?.sync?.bufferMs ?? opts.narrationBuffer)
    : opts.narrationBuffer;
  const bufferMs = Number.isFinite(rawBuffer) && rawBuffer >= 0 ? rawBuffer : 500;

  return { enabled, provider, voice, syncMode, bufferMs };
}

function buildPreSynthMixInputs(params: {
  spec: DemoSpec;
  events: ActionEvent[];
  startTimestamp: number;
  preSynth: NarrationPreSynthesisResult;
}): Array<{ text: string; actionMs: number; durationMs: number; audioPath: string }> {
  const { spec, events, preSynth } = params;
  const t0 = params.startTimestamp;

  const result: Array<{ text: string; actionMs: number; durationMs: number; audioPath: string }> =
    [];
  let actionIndex = 0;

  for (const chapter of spec.chapters) {
    for (const step of chapter.steps) {
      if (step.narration) {
        const entry = preSynth.timing.get(actionIndex);
        if (entry?.audioPath) {
          const ev = events[actionIndex];
          const actionMs = ev ? ev.timestamp - t0 : actionIndex * 3000;
          result.push({
            text: step.narration,
            actionMs,
            durationMs: entry.durationMs,
            audioPath: entry.audioPath,
          });
        }
      }
      actionIndex++;
    }
  }

  return result;
}

async function synthesizeAudio(params: {
  spec: DemoSpec;
  events: ActionEvent[];
  startTimestamp: number;
  settings: Pick<NarrationSettings, "provider" | "voice" | "bufferMs">;
  outputDir: string;
}): Promise<NarrationMixResult | undefined> {
  const scriptMod = await import("../narration/script-generator.js");
  const providerMod = await import("../narration/provider.js");
  const mixerMod = await import("../narration/audio-mixer.js");

  const segments = scriptMod.generateScript(
    params.spec.chapters,
    params.events,
    params.startTimestamp,
  );
  const provider = providerMod.createTTSProvider(params.settings.provider);
  const ttsOpts = params.settings.voice ? { voice: params.settings.voice } : {};

  return mixerMod.mixNarrationAudio(
    segments,
    {
      name: provider.name,
      synthesize: (text) => provider.synthesize(text, ttsOpts),
    },
    params.outputDir,
    params.settings.bufferMs,
  );
}

async function mixNarrationForCapture(params: {
  spec: DemoSpec;
  events: ActionEvent[];
  startTimestamp: number;
  settings: NarrationSettings;
  outputDir: string;
  preSynth?: NarrationPreSynthesisResult | undefined;
}): Promise<NarrationMixResult | undefined> {
  if (!params.settings.enabled) return undefined;

  if (params.settings.syncMode === "auto-sync" && params.preSynth) {
    const inputs = buildPreSynthMixInputs({
      spec: params.spec,
      events: params.events,
      startTimestamp: params.startTimestamp,
      preSynth: params.preSynth,
    });
    if (inputs.length > 0) {
      const mixerMod = await import("../narration/audio-mixer.js");
      return mixerMod.mixPreSynthesizedNarrationAudio(
        inputs,
        params.outputDir,
        params.settings.bufferMs,
      );
    }
    log.warn(
      "Auto-sync enabled but no pre-synth audio segments were produced; falling back to TTS",
    );
  }

  return synthesizeAudio({
    spec: params.spec,
    events: params.events,
    startTimestamp: params.startTimestamp,
    settings: params.settings,
    outputDir: params.outputDir,
  });
}

export async function prepareNarration(params: {
  capture: {
    spec: DemoSpec;
    events: ActionEvent[];
    startTimestamp: number;
    narration?:
      | { settings: NarrationSettings; preSynth?: NarrationPreSynthesisResult | undefined }
      | undefined;
  };
  timeline: Timeline;
  opts: GlobalOptions;
  settings: NarrationSettings;
}): Promise<{
  timeline: Timeline;
  audioPath?: string | undefined;
  extendToMs?: number | undefined;
  timedSegments?: TimedNarrationSegment[] | undefined;
}> {
  if (!params.opts.narration) return { timeline: params.timeline };

  const timelineMod = await import("../editor/timeline.js");

  const narrationResult = await mixNarrationForCapture({
    spec: params.capture.spec,
    events: params.capture.events,
    startTimestamp: params.capture.startTimestamp,
    settings: params.settings,
    outputDir: params.opts.output,
    preSynth: params.capture.narration?.preSynth,
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

export async function writeSubtitlesFromTimed(params: {
  segments: TimedNarrationSegment[];
  outputDir: string;
}): Promise<void> {
  const subsMod = await import("../narration/subtitles.js");
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
