import { describe, it, expect, vi } from "vitest";

const mockBundle = vi.fn().mockResolvedValue("/tmp/bundle");
const mockSelectComposition = vi.fn().mockResolvedValue({
  durationInFrames: 300,
  fps: 30,
});
const mockRenderMedia = vi.fn().mockResolvedValue(undefined);

vi.mock("@remotion/bundler", () => ({
  bundle: mockBundle,
}));

vi.mock("@remotion/renderer", () => ({
  selectComposition: mockSelectComposition,
  renderMedia: mockRenderMedia,
}));

describe("RemotionRenderer", () => {
  it("has id 'remotion'", async () => {
    const { RemotionRenderer } = await import("../../src/editor/renderers/remotion.js");
    const renderer = new RemotionRenderer();
    expect(renderer.id).toBe("remotion");
  });

  it("renders via Remotion pipeline", async () => {
    const { RemotionRenderer } = await import("../../src/editor/renderers/remotion.js");
    const renderer = new RemotionRenderer();

    const result = await renderer.render({
      spec: {
        meta: { title: "Test", resolution: { width: 1920, height: 1080 } },
        runner: { url: "http://localhost:3000", timeout: 30000 },
        chapters: [{ title: "Ch1", steps: [{ action: "navigate" as const, url: "/" }] }],
      } as Parameters<typeof renderer.render>[0]["spec"],
      outFile: "/output/output.mp4",
      tempDir: "/tmp",
      assetsDir: "/assets",
    });

    expect(result.outFile).toBe("/output/output.mp4");
    // durationInFrames=300, fps=30 => (300 / 30) * 1000 = 10000ms
    const expectedMs = (300 / 30) * 1000;
    expect(result.durationMs).toBe(expectedMs);
  });

  it("calls bundle() with entryPoint containing Root.tsx", async () => {
    mockBundle.mockClear();
    const { RemotionRenderer } = await import("../../src/editor/renderers/remotion.js");
    const renderer = new RemotionRenderer();

    await renderer.render({
      spec: {
        meta: { title: "Test", resolution: { width: 1920, height: 1080 } },
        runner: { url: "http://localhost:3000", timeout: 30000 },
        chapters: [{ title: "Ch1", steps: [{ action: "navigate" as const, url: "/" }] }],
      } as Parameters<typeof renderer.render>[0]["spec"],
      outFile: "/output/output.mp4",
      tempDir: "/tmp",
      assetsDir: "/assets",
    });

    expect(mockBundle).toHaveBeenCalledOnce();
    const bundleArgs = mockBundle.mock.calls[0]![0] as { entryPoint: string };
    expect(bundleArgs.entryPoint).toContain("Root.tsx");
  });

  it("calls renderMedia() with codec h264", async () => {
    mockRenderMedia.mockClear();
    const { RemotionRenderer } = await import("../../src/editor/renderers/remotion.js");
    const renderer = new RemotionRenderer();

    await renderer.render({
      spec: {
        meta: { title: "Test", resolution: { width: 1920, height: 1080 } },
        runner: { url: "http://localhost:3000", timeout: 30000 },
        chapters: [{ title: "Ch1", steps: [{ action: "navigate" as const, url: "/" }] }],
      } as Parameters<typeof renderer.render>[0]["spec"],
      outFile: "/output/output.mp4",
      tempDir: "/tmp",
      assetsDir: "/assets",
    });

    expect(mockRenderMedia).toHaveBeenCalledOnce();
    const renderArgs = mockRenderMedia.mock.calls[0]![0] as { codec: string };
    expect(renderArgs.codec).toBe("h264");
  });
});

describe("RemotionRenderer import failures", () => {
  it("throws friendly error when @remotion/bundler import fails", async () => {
    vi.resetModules();
    vi.doMock("@remotion/bundler", () => {
      throw new Error("Cannot find module '@remotion/bundler'");
    });
    vi.doMock("@remotion/renderer", () => ({
      selectComposition: vi.fn(),
      renderMedia: vi.fn(),
    }));

    const { RemotionRenderer } = await import("../../src/editor/renderers/remotion.js");
    const renderer = new RemotionRenderer();

    await expect(
      renderer.render({
        spec: {
          meta: { title: "Test", resolution: { width: 1920, height: 1080 } },
          runner: { url: "http://localhost:3000", timeout: 30000 },
          chapters: [{ title: "Ch1", steps: [{ action: "navigate" as const, url: "/" }] }],
        } as Parameters<typeof renderer.render>[0]["spec"],
        outFile: "/output/output.mp4",
        tempDir: "/tmp",
        assetsDir: "/assets",
      }),
    ).rejects.toThrow("@remotion/bundler not installed");
  });

  it("throws friendly error when @remotion/renderer import fails", async () => {
    vi.resetModules();
    vi.doMock("@remotion/bundler", () => ({
      bundle: vi.fn().mockResolvedValue("/tmp/bundle"),
    }));
    vi.doMock("@remotion/renderer", () => {
      throw new Error("Cannot find module '@remotion/renderer'");
    });

    const { RemotionRenderer } = await import("../../src/editor/renderers/remotion.js");
    const renderer = new RemotionRenderer();

    await expect(
      renderer.render({
        spec: {
          meta: { title: "Test", resolution: { width: 1920, height: 1080 } },
          runner: { url: "http://localhost:3000", timeout: 30000 },
          chapters: [{ title: "Ch1", steps: [{ action: "navigate" as const, url: "/" }] }],
        } as Parameters<typeof renderer.render>[0]["spec"],
        outFile: "/output/output.mp4",
        tempDir: "/tmp",
        assetsDir: "/assets",
      }),
    ).rejects.toThrow("@remotion/renderer not installed");
  });
});
