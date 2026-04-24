import type { DemoSpec } from "../spec/types.js";
import type { ActionEvent } from "../playback/types.js";
import type { PlaywrightPage } from "../playback/actions.js";
import { createLogger } from "../utils/logger.js";
import type { GlobalOptions } from "./options.js";
import type { NarrationPreSynthesisResult } from "../utils/narration-sync-types.js";
import type { NarrationSettings } from "./narration.js";
import type { ScreenshotCollectorResults } from "../playback/screenshot-collector.js";
import {
  handleCaptureFailure,
  writeCaptureEnvironmentArtifact,
  writePassedVerificationArtifact,
} from "./capture-artifacts.js";
import {
  createPlaybackEngine,
  prepareNarrationTiming,
  resolveChangeDetectionConfig,
} from "./capture-runtime.js";
import { runPreSteps } from "../playback/presteps.js";
import { preflight } from "../validation/preflight.js";
import { attachMonitors, collectIssues } from "../validation/monitor-runner.js";
import { runPostflight } from "./capture-postflight.js";
import * as path from "node:path";

const log = createLogger("cli:capture");
const DEFAULT_BASE_URL = "http://localhost:3000";
type CaptureRecorderModule = typeof import("../capture/recorder.js");

interface CaptureArtifacts {
  tracePath: string;
  eventLogPath: string;
  metadataPath?: string | undefined;
  environmentPath: string;
  verificationPath: string;
}

export interface CaptureResult {
  videoPath: string;
  events: ActionEvent[];
  spec: DemoSpec;
  startTimestamp: number;
  artifacts?: CaptureArtifacts | undefined;
  narration?:
    | { settings: NarrationSettings; preSynth?: NarrationPreSynthesisResult | undefined }
    | undefined;
  /** Phase 4 visual data from ScreenshotCollector (optional). */
  screenshotData?: ScreenshotCollectorResults | undefined;
}

async function prepareCaptureSession(params: {
  browser: unknown;
  captureMod: CaptureRecorderModule;
  spec: DemoSpec;
  specPath?: string | undefined;
  opts: GlobalOptions;
  settings: NarrationSettings;
}): Promise<{
  captureOpts: {
    outputDir: string;
    resolution: DemoSpec["meta"]["resolution"];
    strictGeometry: boolean;
  };
  recording: Awaited<ReturnType<typeof params.captureMod.createRecordingContext>>;
  page: PlaywrightPage;
  baseUrl: string;
  environmentPath: string;
}> {
  const captureOpts = {
    outputDir: params.opts.output,
    resolution: params.opts.resolutionOverride ?? params.spec.meta.resolution,
    strictGeometry: params.opts.strictGeometry,
  };
  const recording = await params.captureMod.createRecordingContext(
    params.browser as Parameters<typeof params.captureMod.createRecordingContext>[0],
    captureOpts,
  );
  const page = recording.page as unknown as PlaywrightPage;
  const baseUrl = params.spec.runner?.url ?? DEFAULT_BASE_URL;
  if (params.spec.runner?.url === undefined && params.spec.preSteps?.length) {
    log.warn(`No runner.url specified; preSteps will use default baseUrl ${DEFAULT_BASE_URL}`);
  }

  const environmentPath = await writeCaptureEnvironmentArtifact({
    spec: params.spec,
    ...(params.specPath ? { specPath: params.specPath } : {}),
    baseUrl,
    outputDir: params.opts.output,
    resolution: captureOpts.resolution,
    ...(recording.geometry ? { observedGeometry: recording.geometry } : {}),
    opts: params.opts,
    settings: params.settings,
  });

  return { captureOpts, recording, page, baseUrl, environmentPath };
}

async function finalizeSuccessfulCapture(params: {
  captureMod: CaptureRecorderModule;
  recording: { context: unknown; page: unknown };
  captureOpts: { outputDir: string; resolution: DemoSpec["meta"]["resolution"] };
  spec: DemoSpec;
  specPath?: string | undefined;
  events: ActionEvent[];
  startTimestamp: number;
  environmentPath: string;
  narration?: CaptureResult["narration"];
}): Promise<CaptureResult> {
  const bundle = await params.captureMod.finalizeCapture(
    params.recording.context as never,
    params.recording.page as never,
    params.events,
    {
      ...params.captureOpts,
      meta: {
        schemaVersion: 1,
        startTimestamp: params.startTimestamp,
        createdAt: new Date().toISOString(),
        specTitle: params.spec.meta.title,
      },
    },
  );
  const verificationPath = await writePassedVerificationArtifact({
    spec: params.spec,
    ...(params.specPath ? { specPath: params.specPath } : {}),
    outputDir: params.captureOpts.outputDir,
    eventCount: params.events.length,
    startTimestamp: params.startTimestamp,
    bundle,
    environmentPath: params.environmentPath,
  });

  return {
    videoPath: bundle.videoPath,
    events: params.events,
    spec: params.spec,
    startTimestamp: params.startTimestamp,
    artifacts: {
      tracePath: bundle.tracePath,
      eventLogPath: bundle.eventLogPath,
      metadataPath: bundle.metadataPath,
      environmentPath: params.environmentPath,
      verificationPath,
    },
    narration: params.narration,
  };
}

interface CaptureWithBrowserParams {
  browser: unknown;
  captureMod: CaptureRecorderModule;
  PlaybackEngine: typeof import("../playback/engine.js").PlaybackEngine;
  spec: DemoSpec;
  specPath?: string | undefined;
  specDir?: string | undefined;
  opts: GlobalOptions;
  settings: NarrationSettings;
}

async function captureWithBrowser(params: CaptureWithBrowserParams): Promise<CaptureResult> {
  const specPathOpt = params.specPath ? { specPath: params.specPath } : {};
  const session = await prepareCaptureSession({
    browser: params.browser,
    captureMod: params.captureMod,
    spec: params.spec,
    ...specPathOpt,
    opts: params.opts,
    settings: params.settings,
  });

  await runPreSteps({
    page: session.page,
    baseUrl: session.baseUrl,
    preSteps: params.spec.preSteps,
  });

  const narrationPrep = await prepareNarrationTiming({
    spec: params.spec,
    settings: params.settings,
    outputDir: params.opts.output,
  });

  const collectorMod = await import("../playback/screenshot-collector.js");
  const screenshotCollector = collectorMod.tryCreateCollector();
  const engine = createPlaybackEngine({
    PlaybackEngine: params.PlaybackEngine,
    page: session.page,
    baseUrl: session.baseUrl,
    outputDir: params.opts.output,
    spec: params.spec,
    specDir: params.specDir,
    settings: params.settings,
    timing: narrationPrep.timing,
    changeDetection: resolveChangeDetectionConfig(params.spec, params.opts),
    screenshotCollector,
  });

  const monitors = attachMonitors(session.page, { runnerUrl: session.baseUrl });

  try {
    const result = await engine.execute(params.spec.chapters);
    const monitorIssues = collectIssues(monitors);
    const screenshotData = collectorMod.collectResults(screenshotCollector);

    const captureResult = await finalizeSuccessfulCapture({
      captureMod: params.captureMod,
      recording: session.recording,
      captureOpts: session.captureOpts,
      spec: params.spec,
      ...specPathOpt,
      events: result.events,
      startTimestamp: result.startTimestamp,
      environmentPath: session.environmentPath,
      narration: params.settings.enabled
        ? { settings: params.settings, preSynth: narrationPrep.preSynth }
        : undefined,
    });
    captureResult.screenshotData = screenshotData;
    await runPostflight({
      captureResult,
      ...params,
      events: result.events,
      startTimestamp: result.startTimestamp,
      monitorIssues,
    });
    return captureResult;
  } catch (err) {
    collectIssues(monitors);
    return await handleCaptureFailure({
      captureMod: params.captureMod,
      recording: session.recording,
      page: session.page,
      captureOpts: session.captureOpts,
      spec: params.spec,
      ...specPathOpt,
      environmentPath: session.environmentPath,
      err,
    });
  }
}

export async function captureFromSpec(params: {
  spec: DemoSpec;
  specPath?: string;
  /** Explicit specDir override; takes precedence over the value derived from specPath. */
  specDir?: string | undefined;
  opts: GlobalOptions;
  settings: NarrationSettings;
}): Promise<CaptureResult> {
  const runnerMod = await import("../runner/runner.js");
  const captureMod = await import("../capture/recorder.js");
  const { PlaybackEngine } = await import("../playback/engine.js");
  const pw = await import("playwright");
  const spec = params.spec;
  const specDir =
    params.specDir ??
    (params.specPath ? path.dirname(path.resolve(params.specPath)) : process.cwd());

  await preflight({
    spec,
    ...(params.specPath ? { specPath: params.specPath } : {}),
    specDir,
    opts: params.opts,
    settings: params.settings,
  });

  // Spec-level selectApproach as fallback when CLI flag was not provided.
  if (!process.env["DM_SELECT_APPROACH"] && spec.meta.selectApproach) {
    process.env["DM_SELECT_APPROACH"] = spec.meta.selectApproach;
  }

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
        specPath: params.specPath,
        specDir:
          params.specDir ??
          (params.specPath ? path.dirname(path.resolve(params.specPath)) : undefined),
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
