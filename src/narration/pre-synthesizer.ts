import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createLogger } from "../utils/logger.js";
import type { DemoSpec } from "../spec/types.js";
import type { TTSOptions, TTSProvider } from "./types.js";
import type {
  NarrationPreSynthesisResult,
  NarrationTimingMap,
} from "../utils/narration-sync-types.js";

const log = createLogger("pre-synthesizer");

interface NarrationItem {
  actionIndex: number;
  text: string;
  action: string;
}

export function extractNarrationItems(spec: DemoSpec): NarrationItem[] {
  const items: NarrationItem[] = [];
  let actionIndex = 0;

  for (const chapter of spec.chapters) {
    for (const step of chapter.steps) {
      if (step.narration) {
        items.push({ actionIndex, text: step.narration, action: step.action });
      }
      actionIndex++;
    }
  }

  return items;
}

function estimateDurationMs(text: string): number {
  // Rough fallback: ~150 wpm ~= 2.5 w/s.
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const seconds = Math.max(0.8, words / 2.5);
  return Math.round(seconds * 1000);
}

function tryParsePcmWavDurationMs(buf: Buffer): number | undefined {
  // Works for standard 44-byte PCM WAV (what Kokoro provider generates).
  if (buf.length < 44) return undefined;
  if (buf.toString("ascii", 0, 4) !== "RIFF") return undefined;
  if (buf.toString("ascii", 8, 12) !== "WAVE") return undefined;
  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  const dataBytes = buf.readUInt32LE(40);
  if (numChannels <= 0 || sampleRate <= 0 || bitsPerSample <= 0) return undefined;
  const bytesPerSample = bitsPerSample / 8;
  const denom = sampleRate * numChannels * bytesPerSample;
  if (!Number.isFinite(denom) || denom <= 0) return undefined;
  const seconds = dataBytes / denom;
  return Math.round(seconds * 1000);
}

function guessExtension(audio: Buffer): string {
  if (audio.length >= 12) {
    const riff = audio.toString("ascii", 0, 4);
    const wave = audio.toString("ascii", 8, 12);
    if (riff === "RIFF" && wave === "WAVE") return "wav";
  }
  if (audio.length >= 3 && audio.toString("ascii", 0, 3) === "ID3") return "mp3";
  if (audio.length >= 2 && audio[0] === 0xff && (audio[1]! & 0xe0) === 0xe0) return "mp3";
  return "audio";
}

async function probeDurationMsWithFfprobe(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath],
      { stdio: "pipe" },
    );
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => reject(new Error(`Failed to spawn ffprobe: ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${String(code)}: ${stderr.slice(-200)}`));
        return;
      }
      const seconds = parseFloat(stdout.trim());
      if (isNaN(seconds)) {
        reject(new Error(`ffprobe returned invalid duration: ${stdout.trim()}`));
        return;
      }
      resolve(Math.round(seconds * 1000));
    });
  });
}

export function buildEstimatedNarrationTiming(spec: DemoSpec): NarrationTimingMap {
  const timing: NarrationTimingMap = new Map();
  for (const item of extractNarrationItems(spec)) {
    timing.set(item.actionIndex, { text: item.text, durationMs: estimateDurationMs(item.text) });
  }
  return timing;
}

export async function preSynthesizeNarration(
  spec: DemoSpec,
  provider: TTSProvider,
  ttsOptions: TTSOptions,
  outputDir: string,
): Promise<NarrationPreSynthesisResult | undefined> {
  const items = extractNarrationItems(spec);
  if (items.length === 0) return undefined;

  const dir = join(outputDir, "narration", "pre");
  await mkdir(dir, { recursive: true });

  log.info(`Pre-synthesizing ${String(items.length)} narration segment(s) with ${provider.name}`);

  const timing: NarrationTimingMap = new Map();

  for (const item of items) {
    try {
      const audio = await provider.synthesize(item.text, ttsOptions);
      const ext = guessExtension(audio);
      const audioPath = join(dir, `seg-${item.actionIndex}.${ext}`);
      await writeFile(audioPath, audio);

      let durationMs: number | undefined =
        ext === "wav" ? tryParsePcmWavDurationMs(audio) : undefined;
      if (durationMs === undefined) {
        try {
          durationMs = await probeDurationMsWithFfprobe(audioPath);
        } catch (err) {
          // ffprobe might be missing; keep going with an estimate.
          log.warn(
            `Failed to measure duration for action ${String(item.actionIndex)} (${item.action}): ${String(
              err,
            )}`,
          );
          durationMs = estimateDurationMs(item.text);
        }
      }

      timing.set(item.actionIndex, { text: item.text, durationMs, audioPath });
      log.debug(
        `Segment ${String(item.actionIndex)} (${item.action}): ${durationMs}ms -> ${audioPath}`,
      );
    } catch (err) {
      log.warn(
        `Failed to synthesize segment for action ${String(item.actionIndex)} (${item.action}): ${String(
          err,
        )}`,
      );
      timing.set(item.actionIndex, { text: item.text, durationMs: estimateDurationMs(item.text) });
    }
  }

  return {
    timing,
    providerName: provider.name,
    outputDir: dir,
  };
}
