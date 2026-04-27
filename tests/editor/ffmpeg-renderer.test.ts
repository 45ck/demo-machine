import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Timeline, RenderOptions } from "../../src/editor/types.js";

const mockSpawn = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => {
    mockSpawn(...args);
    const handlers: Record<string, (...a: unknown[]) => void> = {};
    return {
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
        handlers[event] = cb;
        if (event === "close") {
          // Simulate successful close on next tick
          setTimeout(() => cb(0), 0);
        }
      }),
    };
  },
}));

describe("FfmpegRenderer.buildArgs", () => {
  let FfmpegRenderer: typeof import("../../src/editor/renderers/ffmpeg.js").FfmpegRenderer;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../../src/editor/renderers/ffmpeg.js");
    FfmpegRenderer = mod.FfmpegRenderer;
  });

  const baseTimeline: Timeline = {
    segments: [],
    totalDurationMs: 5000,
    resolution: { width: 1920, height: 1080 },
  };

  it("places video -ss only before the video input when trimStartMs > 0 and audioPath is set", async () => {
    const renderer = new FfmpegRenderer();
    const options: RenderOptions = {
      outputPath: "/output/output.mp4",
      videoPath: "/input/video.webm",
      trimStartMs: 2000,
      audioPath: "/audio/narration.mp3",
    };

    await renderer.render(baseTimeline, options);

    expect(mockSpawn).toHaveBeenCalledOnce();
    const args = mockSpawn.mock.calls[0]![1] as string[];

    // Find all -ss occurrences
    const ssIndices = args.reduce<number[]>((acc, arg, i) => {
      if (arg === "-ss") acc.push(i);
      return acc;
    }, []);

    expect(ssIndices).toHaveLength(1);

    // Find -i occurrences
    const iIndices = args.reduce<number[]>((acc, arg, i) => {
      if (arg === "-i") acc.push(i);
      return acc;
    }, []);

    expect(iIndices).toHaveLength(2);

    // First -ss before first -i (video)
    expect(ssIndices[0]).toBeLessThan(iIndices[0]!);
    expect(args[ssIndices[0]! + 1]).toBe("2.000");
  });

  it("trims audio separately when audioTrimStartMs is set", async () => {
    const renderer = new FfmpegRenderer();
    const options: RenderOptions = {
      outputPath: "/output/output.mp4",
      videoPath: "/input/video.webm",
      trimStartMs: 2000,
      audioTrimStartMs: 750,
      audioPath: "/audio/narration.mp3",
    };

    await renderer.render(baseTimeline, options);

    const args = mockSpawn.mock.calls[0]![1] as string[];
    const ssIndices = args.reduce<number[]>((acc, arg, i) => {
      if (arg === "-ss") acc.push(i);
      return acc;
    }, []);
    const iIndices = args.reduce<number[]>((acc, arg, i) => {
      if (arg === "-i") acc.push(i);
      return acc;
    }, []);

    expect(ssIndices).toHaveLength(2);
    expect(ssIndices[0]).toBeLessThan(iIndices[0]!);
    expect(ssIndices[1]).toBeLessThan(iIndices[1]!);
    expect(args[ssIndices[0]! + 1]).toBe("2.000");
    expect(args[ssIndices[1]! + 1]).toBe("0.750");
  });

  it("has only one -ss when trimStartMs > 0 but no audioPath", async () => {
    const renderer = new FfmpegRenderer();
    const options: RenderOptions = {
      outputPath: "/output/output.mp4",
      videoPath: "/input/video.webm",
      trimStartMs: 2000,
    };

    await renderer.render(baseTimeline, options);

    const args = mockSpawn.mock.calls[0]![1] as string[];
    const ssCount = args.filter((a) => a === "-ss").length;
    expect(ssCount).toBe(1);
  });

  it("has no -ss when trimStartMs is 0", async () => {
    const renderer = new FfmpegRenderer();
    const options: RenderOptions = {
      outputPath: "/output/output.mp4",
      videoPath: "/input/video.webm",
      trimStartMs: 0,
      audioPath: "/audio/narration.mp3",
    };

    await renderer.render(baseTimeline, options);

    const args = mockSpawn.mock.calls[0]![1] as string[];
    const ssCount = args.filter((a) => a === "-ss").length;
    expect(ssCount).toBe(0);
  });

  it("trims rendered output to the timeline duration when narration does not extend it", async () => {
    const renderer = new FfmpegRenderer();
    const options: RenderOptions = {
      outputPath: "/output/output.mp4",
      videoPath: "/input/video.webm",
    };

    await renderer.render(baseTimeline, options);

    const args = mockSpawn.mock.calls[0]![1] as string[];
    const tIndex = args.indexOf("-t");
    expect(tIndex).toBeGreaterThan(-1);
    expect(args[tIndex + 1]).toBe("5.000");
  });

  it("uses the extended narration duration when narration is longer than the capture", async () => {
    const renderer = new FfmpegRenderer();
    const options: RenderOptions = {
      outputPath: "/output/output.mp4",
      videoPath: "/input/video.webm",
      audioPath: "/audio/narration.mp3",
      extendToMs: 8000,
    };

    await renderer.render(baseTimeline, options);

    const args = mockSpawn.mock.calls[0]![1] as string[];
    const tIndex = args.indexOf("-t");
    expect(tIndex).toBeGreaterThan(-1);
    expect(args[tIndex + 1]).toBe("8.000");
  });
});
