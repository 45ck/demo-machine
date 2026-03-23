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
import type { VideoProbeResult, ManifestEntry, QualityCheckContext } from "./types.js";

export interface QualityGateResult {
  results: CheckResult[];
  hasFailures: boolean;
  durationMs: number;
}

export async function runQualityGate(params: {
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
}): Promise<QualityGateResult> {
  const start = Date.now();
  const results: CheckResult[] = [];
  const probeFn = params.probeVideoFn ?? defaultProbeVideo;
  const statFn = params.statFileFn ?? defaultStatFile;

  // Probe video once
  let probeResult: VideoProbeResult | undefined;
  try {
    probeResult = await probeFn(params.outputMp4Path);
  } catch (err) {
    results.push(
      postRenderWarn(
        "probe-video",
        `Could not probe video: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  // Stat file once
  let fileSizeBytes: number | undefined;
  try {
    fileSizeBytes = await statFn(params.outputMp4Path);
  } catch (err) {
    results.push(
      postRenderWarn(
        "stat-file",
        `Could not stat file: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

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
  out.push(...safeRun(() => checkNarrationOrdering(ctx)));
  out.push(...safeRun(() => checkFrameRate(ctx)));
  out.push(...safeRun(() => checkIntroOutro(ctx)));
  out.push(...safeRun(() => checkDurationAnomalies(ctx)));
  return out;
}

async function defaultStatFile(path: string): Promise<number> {
  const s = await stat(path);
  return s.size;
}
