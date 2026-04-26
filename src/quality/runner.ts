import { stat } from "node:fs/promises";
import type { CheckResult } from "../validation/types.js";
import { postRenderWarn } from "../validation/types.js";
import { probeVideo as defaultProbeVideo } from "./ffprobe.js";
import { checkResolution } from "./checks/resolution.js";
import { checkAudioVideoDuration } from "./checks/av-duration.js";
import { checkCodecCompliance } from "./checks/codec.js";
import { checkFileSize } from "./checks/file-size.js";
import { checkNarrationOrdering } from "./checks/narration-ordering.js";
import { checkFrameRate } from "./checks/frame-rate.js";
import { checkIntroOutro } from "./checks/intro-outro.js";
import { checkDurationAnomalies } from "./checks/duration-anomaly.js";
import { checkStepScreenshots } from "./checks/visual/step-screenshot.js";
import { checkAssertZeroEffect } from "./checks/visual/assert-zero-effect.js";
import { checkPhantomOverlay } from "./checks/visual/phantom-overlay.js";
import { checkCursorPosition } from "./checks/visual/cursor-position.js";
import { checkChapterTitles } from "./checks/visual/chapter-title.js";
import { checkFileSizeTrend } from "./checks/file-size-trend.js";
import {
  checkRenderedVideoIntegrity,
  renderedVideoIntegrityContextFromQualityGate,
} from "./checks/rendered-video-integrity.js";
import { extractRenderedVideoSamples as defaultExtractRenderedVideoSamples } from "./video-sampler.js";
import type {
  RenderedVideoFrameSample,
  RenderedVideoSampleExtractionMetadata,
  VideoProbeResult,
  ManifestEntry,
  QualityCheckContext,
} from "./types.js";

export interface QualityGateResult {
  results: CheckResult[];
  hasFailures: boolean;
  durationMs: number;
}

interface RunQualityGateParams {
  outputMp4Path: string;
  spec: { meta: { resolution: { width: number; height: number } } };
  manifestEntry?: ManifestEntry;
  /** Injectable probe function for testing. */
  probeVideoFn?: (path: string) => Promise<VideoProbeResult>;
  /** Injectable stat function for testing. Returns file size in bytes. */
  statFileFn?: (path: string) => Promise<number>;
  /** Action events from events.json, for narration ordering check. */
  events?: QualityCheckContext["events"];
  /** Timed narration segments, for narration ordering check. */
  narrationSegments?: QualityCheckContext["narrationSegments"];
  /** Frame presentation timestamps in seconds, for frame rate check. */
  framePtsSec?: QualityCheckContext["framePtsSec"];
  /** Whether the spec includes an intro segment. */
  hasIntro?: QualityCheckContext["hasIntro"];
  /** Whether the spec includes an outro segment. */
  hasOutro?: QualityCheckContext["hasOutro"];
  /** Expected intro duration in ms (default 2000). */
  introDurationMs?: QualityCheckContext["introDurationMs"];
  /** Expected outro duration in ms (default 2000). */
  outroDurationMs?: QualityCheckContext["outroDurationMs"];
  /** Historical timing data keyed by action type, for duration anomaly check. */
  timingHistory?: QualityCheckContext["timingHistory"];
  /** Step screenshots as PNG buffers, keyed by step index. */
  stepScreenshots?: QualityCheckContext["stepScreenshots"];
  /** Screenshot pairs for assert steps: [beforeAssert, afterAssert]. */
  assertScreenshotPairs?: QualityCheckContext["assertScreenshotPairs"];
  /** Cursor positions at click moments. */
  cursorPositions?: QualityCheckContext["cursorPositions"];
  /** Chapter title frame screenshots as PNG buffers, keyed by chapter index. */
  chapterTitleScreenshots?: QualityCheckContext["chapterTitleScreenshots"];
  /** Previous run's file size in bytes, for file-size-trend check (#48). */
  previousFileSizeBytes?: QualityCheckContext["previousFileSizeBytes"];
  /** Rendered-video frame sample metrics, when an extractor has provided them. */
  renderedVideoFrameSamples?: QualityCheckContext["renderedVideoFrameSamples"];
  /** Metadata from rendered-video frame sample extraction. */
  renderedVideoSampleExtraction?: QualityCheckContext["renderedVideoSampleExtraction"];
  /** Optional thresholds for rendered-video integrity checks. */
  renderedVideoIntegrityThresholds?: QualityCheckContext["renderedVideoIntegrityThresholds"];
  /** Extract rendered frame samples from output.mp4 when explicit samples are absent. */
  extractRenderedVideoSamples?: boolean;
  /** Injectable rendered-video sampler for testing. */
  renderedVideoSamplerFn?: (params: {
    outputMp4Path: string;
    videoDurationMs?: number | undefined;
    events?: QualityCheckContext["events"];
  }) => Promise<{
    samples: RenderedVideoFrameSample[];
    extraction: RenderedVideoSampleExtractionMetadata;
  }>;
}

async function probeForGate(
  params: RunQualityGateParams,
  results: CheckResult[],
): Promise<VideoProbeResult | undefined> {
  try {
    return await (params.probeVideoFn ?? defaultProbeVideo)(params.outputMp4Path);
  } catch (err) {
    results.push(
      postRenderWarn(
        "probe-video",
        `Could not probe video: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return undefined;
  }
}

async function statForGate(
  params: RunQualityGateParams,
  results: CheckResult[],
): Promise<number | undefined> {
  try {
    return await (params.statFileFn ?? defaultStatFile)(params.outputMp4Path);
  } catch (err) {
    results.push(
      postRenderWarn(
        "stat-file",
        `Could not stat file: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return undefined;
  }
}

async function renderedVideoSamplesForGate(params: {
  gateParams: RunQualityGateParams;
  probeResult: VideoProbeResult | undefined;
}): Promise<{
  renderedVideoFrameSamples: QualityCheckContext["renderedVideoFrameSamples"];
  renderedVideoSampleExtraction: QualityCheckContext["renderedVideoSampleExtraction"];
}> {
  if (
    !params.gateParams.extractRenderedVideoSamples ||
    params.gateParams.renderedVideoFrameSamples !== undefined ||
    params.gateParams.renderedVideoSampleExtraction !== undefined
  ) {
    return {
      renderedVideoFrameSamples: params.gateParams.renderedVideoFrameSamples,
      renderedVideoSampleExtraction: params.gateParams.renderedVideoSampleExtraction,
    };
  }

  const sampler = params.gateParams.renderedVideoSamplerFn ?? defaultExtractRenderedVideoSamples;
  const sampled = await sampler({
    outputMp4Path: params.gateParams.outputMp4Path,
    videoDurationMs:
      params.probeResult?.videoDurationSec !== undefined
        ? params.probeResult.videoDurationSec * 1000
        : undefined,
    events: params.gateParams.events,
  });
  return {
    renderedVideoFrameSamples: sampled.samples,
    renderedVideoSampleExtraction: sampled.extraction,
  };
}

export async function runQualityGate(params: RunQualityGateParams): Promise<QualityGateResult> {
  const start = Date.now();
  const results: CheckResult[] = [];
  const probeResult = await probeForGate(params, results);
  const fileSizeBytes = await statForGate(params, results);
  const renderedVideo = await renderedVideoSamplesForGate({ gateParams: params, probeResult });

  const ctx: QualityCheckContext = {
    outputMp4Path: params.outputMp4Path,
    spec: params.spec,
    manifestEntry: params.manifestEntry,
    probeResult,
    fileSizeBytes,
    events: params.events,
    narrationSegments: params.narrationSegments,
    framePtsSec: params.framePtsSec,
    hasIntro: params.hasIntro,
    hasOutro: params.hasOutro,
    introDurationMs: params.introDurationMs,
    outroDurationMs: params.outroDurationMs,
    timingHistory: params.timingHistory,
    stepScreenshots: params.stepScreenshots,
    assertScreenshotPairs: params.assertScreenshotPairs,
    cursorPositions: params.cursorPositions,
    chapterTitleScreenshots: params.chapterTitleScreenshots,
    previousFileSizeBytes: params.previousFileSizeBytes,
    renderedVideoFrameSamples: renderedVideo.renderedVideoFrameSamples,
    renderedVideoSampleExtraction: renderedVideo.renderedVideoSampleExtraction,
    renderedVideoIntegrityThresholds: params.renderedVideoIntegrityThresholds,
  };

  results.push(...executeChecks(ctx, probeResult));

  const durationMs = Date.now() - start;
  return {
    results,
    hasFailures: results.some((r) => r.status === "fail"),
    durationMs,
  };
}

/** Wrap a check so one crash does not kill all subsequent checks. */
function safeRun(fn: () => CheckResult[]): CheckResult[] {
  try {
    return fn();
  } catch (err) {
    return [
      postRenderWarn(
        "internal-error",
        `Check threw: ${err instanceof Error ? err.message : String(err)}`,
      ),
    ];
  }
}

/** Run all quality checks against the given context. */
function executeChecks(
  ctx: QualityCheckContext,
  probeResult: VideoProbeResult | undefined,
): CheckResult[] {
  const out: CheckResult[] = [];
  if (probeResult) {
    out.push(...safeRun(() => checkResolution(ctx)));
    out.push(...safeRun(() => checkAudioVideoDuration(ctx)));
    out.push(...safeRun(() => checkCodecCompliance(ctx)));
  }
  out.push(...safeRun(() => checkFileSize(ctx)));
  out.push(...safeRun(() => checkFileSizeTrend(ctx, ctx.previousFileSizeBytes)));
  out.push(...safeRun(() => checkNarrationOrdering(ctx)));
  out.push(...safeRun(() => checkFrameRate(ctx)));
  out.push(...safeRun(() => checkIntroOutro(ctx)));
  out.push(...safeRun(() => checkDurationAnomalies(ctx)));
  // Phase 4: Visual regression checks
  out.push(...safeRun(() => checkStepScreenshots(ctx)));
  out.push(...safeRun(() => checkAssertZeroEffect(ctx)));
  out.push(...safeRun(() => checkPhantomOverlay(ctx)));
  out.push(...safeRun(() => checkCursorPosition(ctx)));
  out.push(...safeRun(() => checkChapterTitles(ctx)));
  out.push(
    ...safeRun(() =>
      checkRenderedVideoIntegrity(renderedVideoIntegrityContextFromQualityGate(ctx)),
    ),
  );
  return out;
}

async function defaultStatFile(path: string): Promise<number> {
  const s = await stat(path);
  return s.size;
}
