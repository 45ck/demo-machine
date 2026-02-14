import { spawn } from "node:child_process";
import { writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "../utils/logger.js";
import type { TTSProvider } from "./types.js";
import type { NarrationSegment } from "./types.js";

const logger = createLogger("audio-mixer");

interface TimedSegment {
  path: string;
  startMs: number;
  durationMs: number;
}

function probeAudioDurationMs(filePath: string): Promise<number> {
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

// eslint-disable-next-line max-lines-per-function
export async function mixNarrationAudio(
  segments: NarrationSegment[],
  provider: TTSProvider,
  outputDir: string,
): Promise<string | undefined> {
  if (segments.length === 0) {
    logger.info("No narration segments found, skipping TTS");
    return undefined;
  }

  const tmpDir = join(outputDir, ".narration-tmp");
  await mkdir(tmpDir, { recursive: true });

  try {
    const segmentFiles: TimedSegment[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      logger.info(
        `Synthesizing segment ${i + 1}/${segments.length}: "${segment.text.slice(0, 40)}..."`,
      );
      const audio = await provider.synthesize(segment.text, {});
      const segPath = join(tmpDir, `seg-${i}.audio`);
      await writeFile(segPath, audio);
      const durationMs = await probeAudioDurationMs(segPath);
      segmentFiles.push({ path: segPath, startMs: segment.startMs, durationMs });
    }

    adjustTiming(segmentFiles);

    const audioPath = join(outputDir, "narration.wav");

    if (segmentFiles.length === 1) {
      await copyFile(segmentFiles[0]!.path, audioPath);
    } else {
      await mixWithFfmpeg(segmentFiles, audioPath);
    }

    logger.info("Narration synthesized");
    return audioPath;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

const GAP_MS = 200;

function adjustTiming(segmentFiles: TimedSegment[]): void {
  // Shift narration to lead into the action: audio finishes when the action happens
  for (let i = 0; i < segmentFiles.length; i++) {
    const seg = segmentFiles[i]!;
    const actionMs = seg.startMs;
    seg.startMs = Math.max(0, actionMs - seg.durationMs);
    logger.debug(
      `Segment ${i + 1}: action at ${actionMs}ms, narration ${seg.durationMs}ms → starts at ${seg.startMs}ms`,
    );
  }

  // Prevent overlap: if a segment starts before the previous one finishes, push it forward
  for (let i = 1; i < segmentFiles.length; i++) {
    const prev = segmentFiles[i - 1]!;
    const prevEndMs = prev.startMs + prev.durationMs + GAP_MS;
    if (segmentFiles[i]!.startMs < prevEndMs) {
      segmentFiles[i]!.startMs = prevEndMs;
    }
  }
}

function mixWithFfmpeg(segmentFiles: TimedSegment[], audioPath: string): Promise<void> {
  const args = ["-y"];
  for (const seg of segmentFiles) {
    args.push("-i", seg.path);
  }

  const filterParts: string[] = [];
  for (let i = 0; i < segmentFiles.length; i++) {
    const delayMs = Math.max(0, Math.round(segmentFiles[i]!.startMs));
    filterParts.push(`[${i}]adelay=${delayMs}|${delayMs}[a${i}]`);
  }
  const mixInputs = segmentFiles.map((_, i) => `[a${i}]`).join("");
  filterParts.push(`${mixInputs}amix=inputs=${segmentFiles.length}:duration=longest:normalize=0`);

  args.push("-filter_complex", filterParts.join(";"));
  args.push(audioPath);

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: "pipe" });
    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => reject(new Error(`Failed to spawn ffmpeg: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg audio mix exited ${String(code)}: ${stderr.slice(-500)}`));
    });
  });
}
