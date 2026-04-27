import { spawn } from "node:child_process";
import type { VideoProbeResult } from "./types.js";

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  sample_aspect_ratio?: string;
  pix_fmt?: string;
  duration?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { format_name?: string; duration?: string };
}

function extractVideoStream(parsed: FfprobeOutput): FfprobeStream {
  const streams = parsed.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === "video");
  if (!videoStream) {
    throw new Error("ffprobe output contains no video stream");
  }
  return videoStream;
}

function parseDuration(s: string | undefined): number {
  const n = parseFloat(s ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function chooseDuration(streamDuration: string | undefined, fallback: number): number {
  return parseDuration(streamDuration) || fallback;
}

function buildResult(parsed: FfprobeOutput, video: FfprobeStream): VideoProbeResult {
  const audio = (parsed.streams ?? []).find((s) => s.codec_type === "audio");
  const formatDuration = parseDuration(parsed.format?.duration);
  const videoDuration = chooseDuration(video.duration, formatDuration);
  const audioDuration = audio ? chooseDuration(audio.duration, formatDuration) : null;
  return {
    width: video.width ?? 0,
    height: video.height ?? 0,
    sar: video.sample_aspect_ratio ?? "1:1",
    videoCodec: video.codec_name ?? "unknown",
    pixFmt: video.pix_fmt ?? "unknown",
    containerFormat: parsed.format?.format_name ?? "unknown",
    videoDurationSec: videoDuration,
    audioDurationSec: audioDuration,
  };
}

function parseProbeOutput(stdout: string): VideoProbeResult {
  const parsed: FfprobeOutput = JSON.parse(stdout) as FfprobeOutput;
  const video = extractVideoStream(parsed);
  return buildResult(parsed, video);
}

/**
 * Probe a video file with ffprobe and return structured metadata.
 *
 * Spawns `ffprobe -v error -print_format json -show_streams -show_format <path>`
 * and parses the JSON output.
 */
export async function probeVideo(filePath: string): Promise<VideoProbeResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffprobe",
      ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", filePath],
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
      try {
        resolve(parseProbeOutput(stdout));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });
}
