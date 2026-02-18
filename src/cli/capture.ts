import type { DemoSpec } from "../spec/types.js";
import type { ActionEvent } from "../playback/types.js";
import type { PlaywrightPage } from "../playback/actions.js";
import { createLogger } from "../utils/logger.js";
import type { GlobalOptions } from "./options.js";
import type { NarrationPreSynthesisResult } from "../utils/narration-sync-types.js";
import {
  buildEstimatedNarrationTiming,
  preSynthesizeNarration,
} from "../narration/pre-synthesizer.js";
import type { NarrationSettings } from "./narration.js";

const log = createLogger("cli:capture");

interface CaptureResult {
  videoPath: string;
  events: ActionEvent[];
  spec: DemoSpec;
  startTimestamp: number;
  narration?:
    | {
        settings: NarrationSettings;
        preSynth?: NarrationPreSynthesisResult | undefined;
      }
    | undefined;
}

async function prepareNarrationTiming(params: {
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

    // Even if pre-synthesis produced no audio paths for some items, it still contains duration estimates.
    return { timing: pre?.timing ?? buildEstimatedNarrationTiming(params.spec), preSynth: pre };
  } catch (err) {
    log.warn(`Pre-synthesis unavailable, falling back to estimates: ${String(err)}`);
    return { timing: buildEstimatedNarrationTiming(params.spec) };
  }
}

export async function captureFromSpec(params: {
  spec: DemoSpec;
  opts: GlobalOptions;
  settings: NarrationSettings;
}): Promise<CaptureResult> {
  const runnerMod = await import("../runner/runner.js");
  const captureMod = await import("../capture/recorder.js");
  const { PlaybackEngine } = await import("../playback/engine.js");
  const pw = await import("playwright");
  const spec = params.spec;
  log.info(`Running: "${spec.meta.title}"`);

  const handle = spec.runner?.command
    ? await runnerMod.startRunner(runnerMod.createRunnerOptions(spec.runner))
    : undefined;

  try {
    const browser = await pw.chromium.launch({ headless: params.opts.headless });
    const captureOpts = { outputDir: params.opts.output, resolution: spec.meta.resolution };

    const recording = await captureMod.createRecordingContext(
      browser as unknown as Parameters<typeof captureMod.createRecordingContext>[0],
      captureOpts,
    );

    const page = recording.page as unknown as PlaywrightPage;

    const narrationPrep = await prepareNarrationTiming({
      spec,
      settings: params.settings,
      outputDir: params.opts.output,
    });

    const engine = new PlaybackEngine(page, {
      baseUrl: spec.runner?.url ?? "http://localhost:3000",
      redactionSelectors: spec.redaction?.selectors,
      secretPatterns: spec.redaction?.secrets,
      pacing: spec.pacing,
      ...(narrationPrep.timing
        ? {
            narration: {
              mode: params.settings.syncMode,
              bufferMs: params.settings.bufferMs,
              timing: narrationPrep.timing,
            },
          }
        : {}),
    });

    const result = await engine.execute(spec.chapters);
    const bundle = await captureMod.finalizeCapture(
      recording.context,
      recording.page,
      result.events,
      {
        ...captureOpts,
        meta: {
          schemaVersion: 1,
          startTimestamp: result.startTimestamp,
          createdAt: new Date().toISOString(),
          specTitle: spec.meta.title,
        },
      },
    );
    await browser.close();

    return {
      videoPath: bundle.videoPath,
      events: result.events,
      spec,
      startTimestamp: result.startTimestamp,
      narration: params.settings.enabled
        ? { settings: params.settings, preSynth: narrationPrep.preSynth }
        : undefined,
    };
  } finally {
    await handle?.stop();
  }
}
