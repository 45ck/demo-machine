import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoSpecSchema } from "../../src/spec/schema.js";
import type { GlobalOptions } from "../../src/cli/options.js";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  prepareNarration: vi.fn(),
  writeSubtitles: vi.fn(),
  render: vi.fn(),
  quality: vi.fn(),
  probeVideo: vi.fn(),
  generateShareViewer: vi.fn(),
}));

vi.mock("../../src/cli/capture.js", () => ({ captureFromSpec: mocks.capture }));
vi.mock("../../src/cli/narration.js", () => ({
  prepareNarration: mocks.prepareNarration,
  writeSubtitlesFromTimed: mocks.writeSubtitles,
}));
vi.mock("../../src/editor/renderer.js", () => ({
  createRenderer: () => ({ render: mocks.render }),
  createRendererV2: () => ({ render: mocks.render }),
}));
vi.mock("../../src/cli/quality-gate.js", () => ({
  runPostRenderQualityGate: mocks.quality,
}));
vi.mock("../../src/quality/ffprobe.js", () => ({ probeVideo: mocks.probeVideo }));
vi.mock("../../src/share/generator.js", () => ({
  generateShareViewer: mocks.generateShareViewer,
}));

function options(output: string): GlobalOptions {
  return {
    output,
    overwrite: true,
    narration: false,
    edit: true,
    renderer: "ffmpeg",
    ttsProvider: "kokoro",
    narrationSync: "manual",
    narrationBuffer: 500,
    verbose: false,
    headless: true,
    strictGeometry: false,
    trimStartMs: 0,
    timeline: false,
  };
}

describe("run share viewer integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareNarration.mockImplementation(({ timeline }) => Promise.resolve({ timeline }));
    mocks.render.mockImplementation(({ outputPath }) => Promise.resolve(outputPath));
    mocks.quality.mockResolvedValue({ qualityReportPath: "/output/quality.json", status: "pass" });
    mocks.probeVideo.mockResolvedValue({ videoDurationSec: 112.48 });
    mocks.generateShareViewer.mockResolvedValue({
      viewerPath: "/output/viewer.html",
      manifestPath: "/output/viewer.manifest.json",
      manifest: {},
    });
  });

  it("generates the configured viewer only after rendering and quality verification", async () => {
    const spec = demoSpecSchema.parse({
      meta: { title: "Integrated viewer" },
      share: {
        summary: "A complete workflow.",
        profile: {
          label: "Aged Care",
          syntheticBoundary: "Synthetic demonstration data only. Not for clinical use.",
        },
        primaryCta: { label: "Try it", url: "https://demo.example.com" },
      },
      chapters: [{ title: "Start", steps: [{ action: "wait", timeout: 100 }] }],
    });
    mocks.capture.mockResolvedValue({
      outputDir: "/output",
      videoPath: "/output/video.webm",
      events: [{ action: "wait", timestamp: 1_000, duration: 100 }],
      spec,
      startTimestamp: 1_000,
    });
    mocks.prepareNarration.mockImplementation(({ timeline }) =>
      Promise.resolve({ timeline: { ...timeline, totalDurationMs: 112_457 } }),
    );
    const { runFullPipeline } = await import("../../src/cli/pipeline.js");
    const result = await runFullPipeline({
      spec,
      opts: options("/output"),
      settings: {
        enabled: false,
        provider: "kokoro",
        syncMode: "manual",
        bufferMs: 500,
      },
    });

    expect(mocks.generateShareViewer).toHaveBeenCalledWith({
      outputDir: "/output",
      config: spec.share,
      spec,
      events: [{ action: "wait", timestamp: 1_000, duration: 100 }],
      startTimestamp: 1_000,
      durationMs: 112_480,
    });
    expect(mocks.probeVideo).toHaveBeenCalledWith("/output/output.mp4");
    expect(mocks.quality.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.probeVideo.mock.invocationCallOrder[0]!,
    );
    expect(mocks.probeVideo.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.generateShareViewer.mock.invocationCallOrder[0]!,
    );
    expect(result).toMatchObject({
      shareViewerPath: "/output/viewer.html",
      shareManifestPath: "/output/viewer.manifest.json",
      qualityStatus: "pass",
    });
  });
});
