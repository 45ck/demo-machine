import type { DemoSpec } from "../spec/types.js";
import type { PlaywrightPage } from "../playback/actions.js";
import { createLogger } from "../utils/logger.js";
import type { NarrationPreSynthesisResult } from "../utils/narration-sync-types.js";
import {
  buildEstimatedNarrationTiming,
  preSynthesizeNarration,
} from "../narration/pre-synthesizer.js";
import type { NarrationSettings } from "./narration.js";

const log = createLogger("cli:capture:runtime");

export function createPlaybackEngine(params: {
  PlaybackEngine: typeof import("../playback/engine.js").PlaybackEngine;
  page: PlaywrightPage;
  baseUrl: string;
  outputDir: string;
  spec: DemoSpec;
  specDir?: string | undefined;
  settings: NarrationSettings;
  timing?: import("../utils/narration-sync-types.js").NarrationTimingMap | undefined;
}) {
  return new params.PlaybackEngine(params.page, {
    baseUrl: params.baseUrl,
    outputDir: params.outputDir,
    ...(params.specDir ? { specDir: params.specDir } : {}),
    redactionSelectors: params.spec.redaction?.selectors,
    secretPatterns: params.spec.redaction?.secrets,
    pacing: params.spec.pacing,
    ...(params.timing
      ? {
          narration: {
            mode: params.settings.syncMode,
            bufferMs: params.settings.bufferMs,
            timing: params.timing,
          },
        }
      : {}),
  });
}

export async function prepareNarrationTiming(params: {
  spec: DemoSpec;
  settings: NarrationSettings;
  outputDir: string;
}): Promise<{
  timing?: import("../utils/narration-sync-types.js").NarrationTimingMap | undefined;
  preSynth?: NarrationPreSynthesisResult | undefined;
}> {
  if (!params.settings.enabled) return {};
  if (params.settings.syncMode === "manual") return {};

  try {
    const { createTTSProvider } = await import("../narration/provider.js");
    const provider = createTTSProvider(params.settings.provider);
    const ttsOptions = params.settings.voice ? { voice: params.settings.voice } : {};
    const pre =
      (await preSynthesizeNarration(params.spec, provider, ttsOptions, params.outputDir)) ??
      undefined;

    return { timing: pre?.timing ?? buildEstimatedNarrationTiming(params.spec), preSynth: pre };
  } catch (err) {
    log.warn(`Pre-synthesis unavailable, falling back to estimates: ${String(err)}`);
    return { timing: buildEstimatedNarrationTiming(params.spec) };
  }
}
