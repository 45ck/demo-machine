import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TTSProvider, NarrationSegment } from "../../src/narration/types.js";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type { Readable } from "node:stream";

/* ------------------------------------------------------------------ */
/*  Mocks                                                             */
/* ------------------------------------------------------------------ */

const mockCopyFile = vi
  .fn<(src: string, dest: string) => Promise<void>>()
  .mockResolvedValue(undefined);
const mockWriteFile = vi
  .fn<(path: string, data: Buffer) => Promise<void>>()
  .mockResolvedValue(undefined);
const mockMkdir = vi
  .fn<(path: string, opts?: object) => Promise<string | undefined>>()
  .mockResolvedValue(undefined);
const mockRm = vi.fn<(path: string, opts?: object) => Promise<void>>().mockResolvedValue(undefined);

vi.mock("node:fs/promises", () => ({
  copyFile: (...args: unknown[]) => mockCopyFile(args[0] as string, args[1] as string),
  writeFile: (...args: unknown[]) => mockWriteFile(args[0] as string, args[1] as Buffer),
  mkdir: (...args: unknown[]) => mockMkdir(args[0] as string, args[1] as object | undefined),
  rm: (...args: unknown[]) => mockRm(args[0] as string, args[1] as object | undefined),
}));

/**
 * Helper: build a fake ChildProcess whose stdout/stderr are readable
 * EventEmitters and that fires "close" on the next tick.
 */
function makeFakeProc(stdoutData: string, code: number): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  const stdout = new EventEmitter() as Readable;
  const stderr = new EventEmitter() as Readable;
  (proc as unknown as Record<string, unknown>).stdout = stdout;
  (proc as unknown as Record<string, unknown>).stderr = stderr;
  (proc as unknown as Record<string, unknown>).stdin = null;

  // Emit data + close on next micro-task so callers can attach listeners first.
  queueMicrotask(() => {
    stdout.emit("data", Buffer.from(stdoutData));
    proc.emit("close", code);
  });
  return proc;
}

const mockSpawn = vi.fn<(cmd: string, args: string[], opts?: object) => ChildProcess>();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) =>
    mockSpawn(args[0] as string, args[1] as string[], args[2] as object | undefined),
}));

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                    */
/* ------------------------------------------------------------------ */

function makeProvider(): TTSProvider {
  return {
    name: "mock-tts",
    synthesize: vi
      .fn<(text: string, opts: object) => Promise<Buffer>>()
      .mockResolvedValue(Buffer.from("fake-audio")),
  };
}

function makeSegments(texts: string[], startMsList: number[]): NarrationSegment[] {
  return texts.map((text, i) => ({
    text,
    startMs: startMsList[i]!,
    endMs: startMsList[i]! + 1000,
  }));
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe("mixNarrationAudio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: ffprobe returns "1.5\n" (1500 ms) and exits 0
    mockSpawn.mockImplementation((cmd: string) => {
      if (cmd === "ffprobe") {
        return makeFakeProc("1.5\n", 0);
      }
      // ffmpeg – succeed silently
      return makeFakeProc("", 0);
    });
  });

  it("returns undefined for empty segments", async () => {
    const { mixNarrationAudio } = await import("../../src/narration/audio-mixer.js");
    const result = await mixNarrationAudio([], makeProvider(), "/out");
    expect(result).toBeUndefined();
  });

  it("uses copyFile (not ffmpeg) for a single segment", async () => {
    const { mixNarrationAudio } = await import("../../src/narration/audio-mixer.js");
    const provider = makeProvider();
    const segments = makeSegments(["hello world"], [3000]);

    const result = await mixNarrationAudio(segments, provider, "/out");

    // TTS should have been called once
    expect(provider.synthesize).toHaveBeenCalledTimes(1);

    // ffprobe should have been spawned to probe the single file
    expect(mockSpawn).toHaveBeenCalledWith("ffprobe", expect.any(Array), expect.any(Object));

    // copyFile should have been called (single-segment fast path)
    expect(mockCopyFile).toHaveBeenCalledTimes(1);

    // ffmpeg should NOT have been spawned
    const ffmpegCalls = mockSpawn.mock.calls.filter((c) => c[0] === "ffmpeg");
    expect(ffmpegCalls).toHaveLength(0);

    expect(result).toBeDefined();
    expect(result!.audioPath).toContain("narration.wav");
  });

  it("calls ffmpeg for multi-segment mixing", async () => {
    const { mixNarrationAudio } = await import("../../src/narration/audio-mixer.js");
    const provider = makeProvider();
    const segments = makeSegments(["seg one", "seg two"], [2000, 6000]);

    const result = await mixNarrationAudio(segments, provider, "/out");

    // TTS synthesized twice
    expect(provider.synthesize).toHaveBeenCalledTimes(2);

    // ffprobe spawned twice (once per segment)
    const ffprobeCalls = mockSpawn.mock.calls.filter((c) => c[0] === "ffprobe");
    expect(ffprobeCalls).toHaveLength(2);

    // ffmpeg spawned once for mixing
    const ffmpegCalls = mockSpawn.mock.calls.filter((c) => c[0] === "ffmpeg");
    expect(ffmpegCalls).toHaveLength(1);

    // copyFile should NOT be used for multi-segment
    expect(mockCopyFile).not.toHaveBeenCalled();

    expect(result).toBeDefined();
    expect(result!.audioPath).toContain("narration.wav");
  });

  it("returns segments and totalDurationMs in the result (adjustTiming + computeNarrationDuration)", async () => {
    const { mixNarrationAudio } = await import("../../src/narration/audio-mixer.js");
    const provider = makeProvider();
    const segments = makeSegments(["alpha", "beta"], [3000, 8000]);

    const result = await mixNarrationAudio(segments, provider, "/out");

    expect(result).toBeDefined();

    // segments array should be present with timing info
    expect(result!.segments).toHaveLength(2);
    expect(result!.segments[0]!.text).toBe("alpha");
    expect(result!.segments[1]!.text).toBe("beta");

    // Each segment should carry a durationMs from ffprobe (1500)
    expect(result!.segments[0]!.durationMs).toBe(1500);
    expect(result!.segments[1]!.durationMs).toBe(1500);

    // totalDurationMs = last segment startMs + durationMs (computed via computeNarrationDuration)
    expect(result!.totalDurationMs).toBeGreaterThan(0);
    expect(typeof result!.totalDurationMs).toBe("number");
  });
});
