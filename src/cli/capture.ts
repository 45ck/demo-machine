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
import { PlaybackStepError } from "../playback/errors.js";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";

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

function resolveSpecDir(specPath?: string): string | undefined {
  return specPath ? path.dirname(path.resolve(specPath)) : undefined;
}

function buildFailureSummary(err: unknown): {
  name: string;
  message: string;
  chapterTitle?: string | undefined;
  stepIndex?: number | undefined;
  action?: string | undefined;
  selectorForEvent?: string | undefined;
  events?: ActionEvent[] | undefined;
  startTimestamp?: number | undefined;
  cause?: { name?: string; message: string; stack?: string } | undefined;
} {
  const stepErr = err instanceof PlaybackStepError ? err : undefined;
  const message = (err as Error | undefined)?.message ?? String(err);
  const causeValue =
    stepErr && "cause" in stepErr ? (stepErr as unknown as { cause?: unknown }).cause : undefined;
  const stringifyCause = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    try {
      return JSON.stringify(v);
    } catch {
      return "[unserializable cause]";
    }
  };
  const cause =
    causeValue instanceof Error
      ? {
          name: causeValue.name,
          message: causeValue.message,
          ...(causeValue.stack ? { stack: causeValue.stack } : {}),
        }
      : causeValue !== undefined
        ? { message: stringifyCause(causeValue) }
        : undefined;
  return {
    name: stepErr?.name ?? (err as Error | undefined)?.name ?? "Error",
    message,
    chapterTitle: stepErr?.chapterTitle,
    stepIndex: stepErr?.stepIndex,
    action: stepErr?.step?.action,
    selectorForEvent: stepErr?.selectorForEvent,
    events: stepErr?.events,
    startTimestamp: stepErr?.startTimestamp,
    cause,
  };
}

async function writeFailureArtifacts(params: {
  page: PlaywrightPage;
  outDir: string;
  failure: ReturnType<typeof buildFailureSummary>;
}): Promise<void> {
  await mkdir(params.outDir, { recursive: true });

  try {
    await params.page.screenshot({ path: path.join(params.outDir, "failure.png") });
  } catch (sErr) {
    log.warn(`Failed to capture failure screenshot: ${String(sErr)}`);
  }

  try {
    const html = (await params.page.evaluate(
      (() => document.documentElement.outerHTML) as (...args: unknown[]) => unknown,
    )) as string;
    await writeFile(path.join(params.outDir, "failure.html"), html, "utf-8");
  } catch (hErr) {
    log.warn(`Failed to capture failure HTML: ${String(hErr)}`);
  }

  await writeFile(
    path.join(params.outDir, "failure.json"),
    JSON.stringify(params.failure, null, 2) + "\n",
    "utf-8",
  );
}

async function finalizeCaptureSafe(params: {
  captureMod: typeof import("../capture/recorder.js");
  recording: { context: unknown; page: unknown };
  events: ActionEvent[];
  captureOpts: { outputDir: string; resolution: DemoSpec["meta"]["resolution"] };
  specTitle: string;
  startTimestamp: number;
}): Promise<void> {
  try {
    await params.captureMod.finalizeCapture(
      params.recording.context as never,
      params.recording.page as never,
      params.events,
      {
        ...params.captureOpts,
        meta: {
          schemaVersion: 1,
          startTimestamp: params.startTimestamp,
          createdAt: new Date().toISOString(),
          specTitle: params.specTitle,
        },
      },
    );
  } catch (fErr) {
    log.warn(`Failed to finalize capture: ${String(fErr)}`);
  }
}

async function captureWithBrowser(params: {
  browser: unknown;
  captureMod: typeof import("../capture/recorder.js");
  PlaybackEngine: typeof import("../playback/engine.js").PlaybackEngine;
  spec: DemoSpec;
  specDir?: string | undefined;
  opts: GlobalOptions;
  settings: NarrationSettings;
}): Promise<CaptureResult> {
  const captureOpts = { outputDir: params.opts.output, resolution: params.spec.meta.resolution };
  const recording = await params.captureMod.createRecordingContext(
    params.browser as Parameters<typeof params.captureMod.createRecordingContext>[0],
    captureOpts,
  );
  const page = recording.page as unknown as PlaywrightPage;

  const narrationPrep = await prepareNarrationTiming({
    spec: params.spec,
    settings: params.settings,
    outputDir: params.opts.output,
  });

  const engine = new params.PlaybackEngine(page, {
    baseUrl: params.spec.runner?.url ?? "http://localhost:3000",
    ...(params.specDir ? { specDir: params.specDir } : {}),
    redactionSelectors: params.spec.redaction?.selectors,
    secretPatterns: params.spec.redaction?.secrets,
    pacing: params.spec.pacing,
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

  try {
    const result = await engine.execute(params.spec.chapters);
    const bundle = await params.captureMod.finalizeCapture(
      recording.context,
      recording.page,
      result.events,
      {
        ...captureOpts,
        meta: {
          schemaVersion: 1,
          startTimestamp: result.startTimestamp,
          createdAt: new Date().toISOString(),
          specTitle: params.spec.meta.title,
        },
      },
    );

    return {
      videoPath: bundle.videoPath,
      events: result.events,
      spec: params.spec,
      startTimestamp: result.startTimestamp,
      narration: params.settings.enabled
        ? { settings: params.settings, preSynth: narrationPrep.preSynth }
        : undefined,
    };
  } catch (err) {
    const failure = buildFailureSummary(err);
    await writeFailureArtifacts({ page, outDir: params.opts.output, failure });
    await finalizeCaptureSafe({
      captureMod: params.captureMod,
      recording,
      events: failure.events ?? [],
      captureOpts,
      specTitle: params.spec.meta.title,
      startTimestamp: failure.startTimestamp ?? Date.now(),
    });
    throw err;
  }
}

export async function captureFromSpec(params: {
  spec: DemoSpec;
  specPath?: string;
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
    try {
      return await captureWithBrowser({
        browser,
        captureMod,
        PlaybackEngine,
        spec,
        specDir: resolveSpecDir(params.specPath),
        opts: params.opts,
        settings: params.settings,
      });
    } finally {
      await browser.close();
    }
  } finally {
    await handle?.stop();
  }
}
