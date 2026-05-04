import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import type { RenderedVideoFrameSample, RenderedVideoSampleExtractionMetadata } from "./types.js";

const execFileAsync = promisify(execFile);
const DEFAULT_INTERVAL_MS = 2_000;
const DEFAULT_START_OFFSET_MS = 250;
const DEFAULT_MAX_SAMPLES = 48;
const MIN_SAMPLE_GAP_MS = 80;
const BLANK_STDDEV_THRESHOLD = 4;
const BLANK_DARK_LUMA = 8;

interface PngImage {
  data: Uint8Array;
  width: number;
  height: number;
}

interface PngStatic {
  sync: { read: (buf: Buffer) => PngImage };
}

interface RenderedVideoSamplingOptions {
  intervalMs?: number | undefined;
  startSampleOffsetMs?: number | undefined;
  maxSamples?: number | undefined;
  tempDir?: string | undefined;
  keepFrames?: boolean | undefined;
}

interface ExtractRenderedVideoSamplesParams {
  outputMp4Path: string;
  videoDurationMs?: number | undefined;
  events?: Array<{ timestamp: number; duration: number }> | undefined;
  options?: RenderedVideoSamplingOptions | undefined;
}

function pushSample(times: number[], timestampMs: number, durationMs: number): void {
  if (!Number.isFinite(timestampMs)) return;
  times.push(Math.max(0, Math.min(durationMs, Math.round(timestampMs))));
}

function dedupeSampleTimes(times: number[], maxSamples: number): number[] {
  const sorted = [...times].sort((a, b) => a - b);
  const deduped: number[] = [];
  for (const time of sorted) {
    const previous = deduped.at(-1);
    if (previous !== undefined && Math.abs(previous - time) < MIN_SAMPLE_GAP_MS) continue;
    deduped.push(time);
  }
  return deduped.slice(0, maxSamples);
}

export function collectRenderedVideoSampleTimes(params: {
  videoDurationMs: number;
  events?: Array<{ timestamp: number; duration: number }> | undefined;
  options?: RenderedVideoSamplingOptions | undefined;
}): number[] {
  const durationMs = params.videoDurationMs;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return [];

  const intervalMs = params.options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const startSampleOffsetMs = params.options?.startSampleOffsetMs ?? DEFAULT_START_OFFSET_MS;
  const maxSamples = params.options?.maxSamples ?? DEFAULT_MAX_SAMPLES;
  const times: number[] = [];

  pushSample(times, startSampleOffsetMs, durationMs);
  for (let timeMs = intervalMs; timeMs < durationMs; timeMs += intervalMs) {
    pushSample(times, timeMs, durationMs);
  }
  pushSample(times, Math.max(0, durationMs - 50), durationMs);

  for (const event of params.events ?? []) {
    pushSample(times, event.timestamp, durationMs);
    pushSample(times, event.timestamp + event.duration, durationMs);
  }

  return dedupeSampleTimes(times, maxSamples);
}

function loadPng(): PngStatic | null {
  const require = createRequire(import.meta.url);
  try {
    return (require("pngjs") as { PNG: PngStatic }).PNG;
  } catch {
    return null;
  }
}

async function extractFrame(params: {
  outputMp4Path: string;
  timestampMs: number;
  framePath: string;
}): Promise<void> {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      (params.timestampMs / 1000).toFixed(3),
      "-i",
      params.outputMp4Path,
      "-frames:v",
      "1",
      "-f",
      "image2",
      params.framePath,
    ],
    { windowsHide: true },
  );
}

function pngStats(image: PngImage): { lumaMean: number; lumaStdDev: number } {
  const pixels = image.width * image.height;
  let sum = 0;
  let sumSquares = 0;

  for (let i = 0; i < image.data.length; i += 4) {
    const luma =
      0.2126 * image.data[i]! + 0.7152 * image.data[i + 1]! + 0.0722 * image.data[i + 2]!;
    sum += luma;
    sumSquares += luma * luma;
  }

  const lumaMean = pixels > 0 ? sum / pixels : 0;
  const variance = pixels > 0 ? sumSquares / pixels - lumaMean * lumaMean : 0;
  return { lumaMean, lumaStdDev: Math.sqrt(Math.max(0, variance)) };
}

function blankFromStats(stats: { lumaMean: number; lumaStdDev: number }): boolean {
  if (stats.lumaStdDev > BLANK_STDDEV_THRESHOLD) return false;
  return stats.lumaMean <= BLANK_DARK_LUMA;
}

function differenceFromPrevious(previous: PngImage | null, current: PngImage): number | undefined {
  if (!previous) return undefined;
  if (previous.width !== current.width || previous.height !== current.height) return 1;

  let totalDelta = 0;
  const pixels = current.width * current.height;
  for (let i = 0; i < current.data.length; i += 4) {
    totalDelta +=
      (Math.abs(previous.data[i]! - current.data[i]!) +
        Math.abs(previous.data[i + 1]! - current.data[i + 1]!) +
        Math.abs(previous.data[i + 2]! - current.data[i + 2]!)) /
      3;
  }
  return pixels > 0 ? totalDelta / pixels / 255 : 0;
}

function framePathFor(dir: string, index: number): string {
  return path.join(dir, `sample-${String(index).padStart(3, "0")}.png`);
}

type ExtractedVideoSamples = {
  samples: RenderedVideoFrameSample[];
  extraction: RenderedVideoSampleExtractionMetadata;
};

function skippedExtraction(params: {
  sampleTimes: number[];
  started: number;
  error: string;
}): ExtractedVideoSamples {
  return {
    samples: [],
    extraction: {
      requestedSampleCount: params.sampleTimes.length,
      extractedSampleCount: 0,
      status: "skipped",
      extractor: "ffmpeg+pngjs",
      durationMs: Date.now() - params.started,
      errors: [params.error],
    },
  };
}

async function extractSingleSample(params: {
  PNG: PngStatic;
  outputMp4Path: string;
  timestampMs: number;
  framePath: string;
  previousImage: PngImage | null;
}): Promise<{ sample: RenderedVideoFrameSample; image: PngImage }> {
  await extractFrame({
    outputMp4Path: params.outputMp4Path,
    timestampMs: params.timestampMs,
    framePath: params.framePath,
  });
  const image = params.PNG.sync.read(await readFile(params.framePath));
  const stats = pngStats(image);
  const diff = differenceFromPrevious(params.previousImage, image);
  return {
    image,
    sample: {
      timestampMs: params.timestampMs,
      lumaMean: Number(stats.lumaMean.toFixed(3)),
      lumaStdDev: Number(stats.lumaStdDev.toFixed(3)),
      blank: blankFromStats(stats),
      ...(diff !== undefined ? { differenceFromPrevious: Number(diff.toFixed(6)) } : {}),
    },
  };
}

function extractionStatus(params: {
  errors: string[];
  samples: RenderedVideoFrameSample[];
}): RenderedVideoSampleExtractionMetadata["status"] {
  if (params.errors.length === 0) return "success";
  return params.samples.length === 0 ? "failed" : "partial";
}

async function extractSamplesFromFrames(params: {
  PNG: PngStatic;
  outputMp4Path: string;
  sampleTimes: number[];
  frameDir: string;
}): Promise<{ samples: RenderedVideoFrameSample[]; errors: string[] }> {
  const out: { samples: RenderedVideoFrameSample[]; errors: string[] } = {
    samples: [],
    errors: [],
  };
  let previousImage: PngImage | null = null;

  for (let i = 0; i < params.sampleTimes.length; i++) {
    const timestampMs = params.sampleTimes[i]!;
    try {
      const extracted = await extractSingleSample({
        PNG: params.PNG,
        outputMp4Path: params.outputMp4Path,
        timestampMs,
        framePath: framePathFor(params.frameDir, i),
        previousImage,
      });
      out.samples.push(extracted.sample);
      previousImage = extracted.image;
    } catch (err) {
      out.errors.push(
        `sample ${String(i)} at ${String(timestampMs)}ms: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  return out;
}

export async function extractRenderedVideoSamples(
  params: ExtractRenderedVideoSamplesParams,
): Promise<ExtractedVideoSamples> {
  const started = Date.now();
  const PNG = loadPng();
  const sampleTimes = collectRenderedVideoSampleTimes({
    videoDurationMs: params.videoDurationMs ?? 0,
    events: params.events,
    options: params.options,
  });
  if (!PNG) return skippedExtraction({ sampleTimes, started, error: "pngjs is not installed" });

  const frameDir = params.options?.tempDir ?? (await mkdtemp(path.join(tmpdir(), "dm-frames-")));
  const ownsFrameDir = params.options?.tempDir === undefined;
  try {
    const extracted = await extractSamplesFromFrames({
      PNG,
      outputMp4Path: params.outputMp4Path,
      sampleTimes,
      frameDir,
    });
    return {
      samples: extracted.samples,
      extraction: {
        requestedSampleCount: sampleTimes.length,
        extractedSampleCount: extracted.samples.length,
        status: extractionStatus(extracted),
        extractor: "ffmpeg+pngjs",
        durationMs: Date.now() - started,
        ...(extracted.errors.length > 0 ? { errors: extracted.errors } : {}),
      },
    };
  } finally {
    if (ownsFrameDir && !params.options?.keepFrames) {
      await rm(frameDir, { recursive: true, force: true });
    }
  }
}
