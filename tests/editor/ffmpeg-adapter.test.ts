import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Renderer } from "../../src/editor/renderer-types.js";

const mockRender = vi.fn().mockResolvedValue("/output/output.mp4");

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(
    JSON.stringify([
      { action: "navigate", timestamp: 1000, duration: 500 },
      { action: "click", timestamp: 2000, duration: 300, selector: "#btn" },
    ]),
  ),
  stat: vi.fn().mockRejectedValue(new Error("ENOENT")),
}));

vi.mock("../../src/editor/renderers/ffmpeg.js", () => ({
  FfmpegRenderer: vi.fn().mockImplementation(() => ({
    name: "ffmpeg",
    render: mockRender,
  })),
}));

describe("FfmpegRendererAdapter", () => {
  let adapter: Renderer;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRender.mockResolvedValue("/output/output.mp4");
    const { readFile, stat } = await import("node:fs/promises");
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify([
        { action: "navigate", timestamp: 1000, duration: 500 },
        { action: "click", timestamp: 2000, duration: 300, selector: "#btn" },
      ]),
    );
    (stat as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ENOENT"));
    const { FfmpegRendererAdapter } = await import("../../src/editor/renderers/ffmpeg-adapter.js");
    adapter = new FfmpegRendererAdapter();
  });

  it("has id 'ffmpeg'", () => {
    expect(adapter.id).toBe("ffmpeg");
  });

  it("renders from events.json in assetsDir", async () => {
    const result = await adapter.render({
      spec: {
        meta: { title: "Test", resolution: { width: 1920, height: 1080 } },
        runner: { url: "http://localhost:3000", timeout: 30000 },
        chapters: [{ title: "Ch1", steps: [{ action: "navigate" as const, url: "/" }] }],
      } as Parameters<Renderer["render"]>[0]["spec"],
      outFile: "/output/output.mp4",
      tempDir: "/tmp",
      assetsDir: "/assets",
    });

    expect(result.outFile).toBe("/output/output.mp4");
    // events: navigate@1000 dur=500, click@2000 dur=300
    // totalDurationMs = (2000 + 300) - 1000 = 1300
    expect(result.durationMs).toBe(1300);
  });

  it("passes audioPath to inner renderer when audio file exists", async () => {
    const { stat } = await import("node:fs/promises");
    (stat as ReturnType<typeof vi.fn>).mockResolvedValue({ size: 1024 });

    const result = await adapter.render({
      spec: {
        meta: { title: "Test", resolution: { width: 1920, height: 1080 } },
        runner: { url: "http://localhost:3000", timeout: 30000 },
        chapters: [{ title: "Ch1", steps: [{ action: "navigate" as const, url: "/" }] }],
      } as Parameters<Renderer["render"]>[0]["spec"],
      outFile: "/output/output.mp4",
      tempDir: "/tmp",
      assetsDir: "/assets",
    });

    expect(result.outFile).toBe("/output/output.mp4");
    expect(mockRender).toHaveBeenCalledOnce();
    const renderOptions = mockRender.mock.calls[0]![1] as Record<string, unknown>;
    expect(renderOptions.audioPath).toContain("narration.wav");
  });

  it("does not pass audioPath when audio file is missing", async () => {
    const result = await adapter.render({
      spec: {
        meta: { title: "Test", resolution: { width: 1920, height: 1080 } },
        runner: { url: "http://localhost:3000", timeout: 30000 },
        chapters: [{ title: "Ch1", steps: [{ action: "navigate" as const, url: "/" }] }],
      } as Parameters<Renderer["render"]>[0]["spec"],
      outFile: "/output/output.mp4",
      tempDir: "/tmp",
      assetsDir: "/assets",
    });

    expect(result.outFile).toBe("/output/output.mp4");
    expect(mockRender).toHaveBeenCalledOnce();
    const renderOptions = mockRender.mock.calls[0]![1] as Record<string, unknown>;
    expect(renderOptions.audioPath).toBeUndefined();
  });

  it("handles empty events.json", async () => {
    const { readFile } = await import("node:fs/promises");
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue("[]");

    const result = await adapter.render({
      spec: {
        meta: { title: "Test", resolution: { width: 1920, height: 1080 } },
        runner: { url: "http://localhost:3000", timeout: 30000 },
        chapters: [{ title: "Ch1", steps: [{ action: "navigate" as const, url: "/" }] }],
      } as Parameters<Renderer["render"]>[0]["spec"],
      outFile: "/output/output.mp4",
      tempDir: "/tmp",
      assetsDir: "/assets",
    });

    expect(result.outFile).toBe("/output/output.mp4");
    expect(result.durationMs).toBe(0);
  });

  it("passes correct arguments to inner renderer render method", async () => {
    await adapter.render({
      spec: {
        meta: { title: "Test", resolution: { width: 1920, height: 1080 } },
        runner: { url: "http://localhost:3000", timeout: 30000 },
        chapters: [{ title: "Ch1", steps: [{ action: "navigate" as const, url: "/" }] }],
      } as Parameters<Renderer["render"]>[0]["spec"],
      outFile: "/output/output.mp4",
      tempDir: "/tmp",
      assetsDir: "/assets",
    });

    expect(mockRender).toHaveBeenCalledOnce();
    const [timeline, options] = mockRender.mock.calls[0]! as [
      { totalDurationMs: number; segments: unknown[] },
      Record<string, unknown>,
    ];

    // Verify timeline argument
    expect(timeline.totalDurationMs).toBe(1300);
    expect(timeline.segments.length).toBeGreaterThan(0);

    // Verify options argument
    expect(options.outputPath).toBe("/output/output.mp4");
    expect(options.videoPath).toContain("video.webm");
    expect(options.resolution).toEqual({ width: 1920, height: 1080 });
  });
});
