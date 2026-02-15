/**
 * Pre-synthesis module for calculating narration timing before playback
 * This allows demo-machine to automatically adjust action delays to match narration duration
 */

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { DemoSpec, NarrationOptions, NarrationSegment, NarrationTimingMap } from "./types.js";

/**
 * Extracts narration segments from spec chapters/steps
 */
export function extractNarrationSegments(spec: DemoSpec): NarrationSegment[] {
  const segments: NarrationSegment[] = [];
  let actionIndex = 0;

  for (const chapter of spec.chapters) {
    for (const step of chapter.steps) {
      if (step.narration) {
        segments.push({
          actionIndex,
          text: step.narration,
          action: step.action,
        });
      }
      actionIndex++;
    }
  }

  return segments;
}

/**
 * Synthesize a single narration segment using the specified TTS provider
 */
async function synthesizeSegment(
  text: string,
  index: number,
  options: NarrationOptions,
  outputDir: string,
): Promise<string> {
  const audioPath = join(outputDir, `narration-${index}.wav`);

  // For now, implement Kokoro (local TTS) as it's the default
  // Other providers (openai, elevenlabs) would be similar but with API calls
  const provider = options.provider || "kokoro";

  if (provider === "kokoro") {
    await synthesizeWithKokoro(text, audioPath, options.voice);
  } else {
    // Placeholder for other providers
    throw new Error(`TTS provider ${provider} not yet implemented in pre-synthesis`);
  }

  return audioPath;
}

/**
 * Synthesize audio using Kokoro TTS (local, fast, free)
 */
async function synthesizeWithKokoro(
  text: string,
  outputPath: string,
  _voice?: string,
): Promise<void> {
  // Kokoro-js library integration
  // This is a placeholder - the actual implementation would use the kokoro-js library
  // For now, we'll create a mock implementation that can be replaced with real TTS

  // In a real implementation, this would be:
  // const { generateSpeech } = await import('kokoro-js');
  // const audio = await generateSpeech(text, { voice: voice || 'af_sarah' });
  // await writeFile(outputPath, audio);

  // Mock implementation for testing (generates silent audio)
  const duration = estimateDuration(text);
  await generateMockAudio(outputPath, duration);
}

/**
 * Estimate duration based on character count (fallback for testing)
 * Real TTS will provide exact duration
 */
function estimateDuration(text: string): number {
  // Average speaking rate: ~15 characters per second
  const CHARS_PER_SECOND = 15;
  return Math.ceil((text.length / CHARS_PER_SECOND) * 1000);
}

/**
 * Generate mock silent audio file for testing
 */
async function generateMockAudio(outputPath: string, durationMs: number): Promise<void> {
  const durationSec = durationMs / 1000;
  // Use FFmpeg to generate silent audio
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=44100:cl=mono`,
      "-t",
      durationSec.toString(),
      "-y",
      outputPath,
    ]);

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg failed with code ${code}`));
      }
    });

    ffmpeg.on("error", reject);
  });
}

/**
 * Measure audio file duration using ffprobe
 */
async function measureAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      audioPath,
    ]);

    let output = "";
    ffprobe.stdout.on("data", (data) => {
      output += data.toString();
    });

    ffprobe.on("close", (code) => {
      if (code === 0) {
        const durationSec = parseFloat(output.trim());
        resolve(Math.round(durationSec * 1000));
      } else {
        reject(new Error(`ffprobe failed with code ${code}`));
      }
    });

    ffprobe.on("error", reject);
  });
}

/**
 * Pre-synthesizes all narration segments from spec
 * Returns a map of action index → narration timing
 * This allows the playback engine to adjust delays dynamically
 *
 * @param spec - The demo YAML spec
 * @param options - TTS provider config
 * @param outputDir - Directory to store pre-synthesized audio files
 * @returns Map of action index → narration duration (ms) and audio path
 */
export async function preSynthesizeNarration(
  spec: DemoSpec,
  options: NarrationOptions,
  outputDir: string,
): Promise<NarrationTimingMap> {
  const segments = extractNarrationSegments(spec);

  if (segments.length === 0) {
    console.log("[INFO] No narration segments found, skipping pre-synthesis");
    return new Map();
  }

  console.log(`[INFO] Pre-synthesizing ${segments.length} narration segments...`);

  // Create narration subdirectory
  const narrationDir = join(outputDir, "narration");
  await mkdir(narrationDir, { recursive: true });

  const timingMap: NarrationTimingMap = new Map();

  // Synthesize each segment
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    console.log(
      `[INFO] Synthesizing segment ${i + 1}/${segments.length}: "${segment.text.substring(0, 50)}..."`,
    );

    try {
      // Synthesize audio
      const audioPath = await synthesizeSegment(segment.text, i, options, narrationDir);

      // Measure duration
      const durationMs = await measureAudioDuration(audioPath);

      timingMap.set(segment.actionIndex, {
        durationMs,
        audioPath,
        text: segment.text,
      });

      console.log(`[INFO]   Duration: ${(durationMs / 1000).toFixed(1)}s`);
    } catch (error) {
      console.error(`[ERROR] Failed to synthesize segment ${i}:`, error);
      // Continue with other segments even if one fails
    }
  }

  const totalDuration = Array.from(timingMap.values()).reduce(
    (sum, timing) => sum + timing.durationMs,
    0,
  );

  console.log(
    `[INFO] Pre-synthesis complete: ${timingMap.size} segments, total ${(totalDuration / 1000).toFixed(1)}s`,
  );

  return timingMap;
}
