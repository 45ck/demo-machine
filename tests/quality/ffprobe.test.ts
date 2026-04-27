import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VideoProbeResult } from "../../src/quality/types.js";

/* ---------- mock child_process ---------- */

let spawnHandlers: Record<string, (...a: unknown[]) => void> = {};
let stdoutHandlers: Record<string, (...a: unknown[]) => void> = {};
let stderrHandlers: Record<string, (...a: unknown[]) => void> = {};

const mockSpawn = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => {
    mockSpawn(...args);
    spawnHandlers = {};
    stdoutHandlers = {};
    stderrHandlers = {};
    return {
      stdout: {
        on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
          stdoutHandlers[event] = cb;
        }),
      },
      stderr: {
        on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
          stderrHandlers[event] = cb;
        }),
      },
      on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
        spawnHandlers[event] = cb;
      }),
    };
  },
}));

/* ---------- helpers ---------- */

function emitOutput(json: string): void {
  stdoutHandlers["data"]?.(Buffer.from(json));
}

function emitStderr(text: string): void {
  stderrHandlers["data"]?.(Buffer.from(text));
}

function closeWith(code: number): void {
  spawnHandlers["close"]?.(code);
}

function emitSpawnError(msg: string): void {
  spawnHandlers["error"]?.(new Error(msg));
}

/** Standard ffprobe JSON output with one video and one audio stream. */
function standardOutput(overrides?: {
  width?: number;
  height?: number;
  sar?: string;
  codecName?: string;
  pixFmt?: string;
  videoDuration?: string;
  audioDuration?: string;
  formatDuration?: string;
  formatName?: string;
}): string {
  const o = {
    width: 1920,
    height: 1080,
    sar: "1:1",
    codecName: "h264",
    pixFmt: "yuv420p",
    videoDuration: "10.500000",
    audioDuration: "10.400000",
    formatDuration: "10.500000",
    formatName: "mov,mp4,m4a,3gp,3g2,mj2",
    ...overrides,
  };
  return JSON.stringify({
    streams: [
      {
        codec_type: "video",
        codec_name: o.codecName,
        width: o.width,
        height: o.height,
        sample_aspect_ratio: o.sar,
        pix_fmt: o.pixFmt,
        duration: o.videoDuration,
      },
      {
        codec_type: "audio",
        codec_name: "aac",
        duration: o.audioDuration,
      },
    ],
    format: {
      format_name: o.formatName,
      duration: o.formatDuration,
    },
  });
}

/* ---------- tests ---------- */

describe("probeVideo", () => {
  let probeVideo: typeof import("../../src/quality/ffprobe.js").probeVideo;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../../src/quality/ffprobe.js");
    probeVideo = mod.probeVideo;
  });

  it("parses standard ffprobe JSON output into VideoProbeResult", async () => {
    const promise = probeVideo("/path/to/video.mp4");

    emitOutput(standardOutput());
    closeWith(0);

    const result: VideoProbeResult = await promise;
    expect(result).toEqual({
      width: 1920,
      height: 1080,
      sar: "1:1",
      videoCodec: "h264",
      pixFmt: "yuv420p",
      containerFormat: "mov,mp4,m4a,3gp,3g2,mj2",
      videoDurationSec: 10.5,
      audioDurationSec: 10.4,
    });
  });

  it("spawns ffprobe with correct arguments", async () => {
    const promise = probeVideo("/path/to/video.mp4");

    emitOutput(standardOutput());
    closeWith(0);
    await promise;

    expect(mockSpawn).toHaveBeenCalledWith(
      "ffprobe",
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        "/path/to/video.mp4",
      ],
      { stdio: "pipe" },
    );
  });

  it("rejects when ffprobe exits with non-zero code", async () => {
    const promise = probeVideo("/path/to/video.mp4");

    emitStderr("No such file or directory");
    closeWith(1);

    await expect(promise).rejects.toThrow(/ffprobe exited 1/);
  });

  it("rejects when output contains no video stream", async () => {
    const promise = probeVideo("/path/to/audio.mp3");

    const json = JSON.stringify({
      streams: [{ codec_type: "audio", codec_name: "aac", duration: "5.0" }],
      format: { format_name: "mp3" },
    });
    emitOutput(json);
    closeWith(0);

    await expect(promise).rejects.toThrow(/no video stream/i);
  });

  it("handles missing audio stream (audioDurationSec is null)", async () => {
    const promise = probeVideo("/path/to/video.mp4");

    const json = JSON.stringify({
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          width: 1280,
          height: 720,
          sample_aspect_ratio: "1:1",
          pix_fmt: "yuv420p",
          duration: "5.0",
        },
      ],
      format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
    });
    emitOutput(json);
    closeWith(0);

    const result = await promise;
    expect(result.audioDurationSec).toBeNull();
  });

  it("defaults SAR to 1:1 when ffprobe does not report it", async () => {
    const promise = probeVideo("/path/to/video.mp4");

    const json = JSON.stringify({
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          width: 1920,
          height: 1080,
          pix_fmt: "yuv420p",
          duration: "10.0",
        },
      ],
      format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
    });
    emitOutput(json);
    closeWith(0);

    const result = await promise;
    expect(result.sar).toBe("1:1");
  });

  it("rejects when spawn fails (ffprobe not installed)", async () => {
    const promise = probeVideo("/path/to/video.mp4");

    emitSpawnError("spawn ffprobe ENOENT");

    await expect(promise).rejects.toThrow(/spawn ffprobe/i);
  });

  it("rejects when ffprobe output is not valid JSON", async () => {
    const promise = probeVideo("/path/to/video.mp4");

    emitOutput("not json at all");
    closeWith(0);

    await expect(promise).rejects.toThrow();
  });

  it("returns finite duration when ffprobe reports N/A for duration", async () => {
    const promise = probeVideo("/path/to/video.mp4");

    emitOutput(
      standardOutput({ videoDuration: "N/A", audioDuration: "N/A", formatDuration: "N/A" }),
    );
    closeWith(0);

    const result = await promise;
    expect(Number.isFinite(result.videoDurationSec)).toBe(true);
    expect(result.videoDurationSec).toBe(0);
    expect(result.audioDurationSec).toBe(0);
  });

  it("falls back to format duration when stream durations are missing", async () => {
    const promise = probeVideo("/path/to/video.mp4");

    emitOutput(
      standardOutput({
        videoDuration: undefined,
        audioDuration: undefined,
        formatDuration: "12.250000",
      }),
    );
    closeWith(0);

    const result = await promise;
    expect(result.videoDurationSec).toBe(12.25);
    expect(result.audioDurationSec).toBe(12.25);
  });

  it("handles stdout split across multiple data events", async () => {
    const promise = probeVideo("/path/to/video.mp4");

    const json = standardOutput();
    const mid = Math.floor(json.length / 2);
    stdoutHandlers["data"]?.(Buffer.from(json.slice(0, mid)));
    stdoutHandlers["data"]?.(Buffer.from(json.slice(mid)));
    closeWith(0);

    const result = await promise;
    expect(result.width).toBe(1920);
  });
});
