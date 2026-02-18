import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRecordingContext, finalizeCapture } from "../../src/capture/recorder.js";
import type { CaptureOptions } from "../../src/capture/types.js";
import type { ActionEvent } from "../../src/playback/types.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm, writeFile, stat, mkdir } from "node:fs/promises";

describe("recorder", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "recorder-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeOptions(): CaptureOptions {
    return {
      outputDir: join(tempDir, "output"),
      resolution: { width: 1920, height: 1080 },
    };
  }

  function createMockBrowser() {
    const mockPage = {
      video: vi.fn().mockReturnValue({
        path: vi.fn().mockResolvedValue("/tmp/video.webm"),
      }),
    };

    const mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      tracing: {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
      },
      close: vi.fn().mockResolvedValue(undefined),
    };

    const mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
    };

    return { mockBrowser, mockContext, mockPage };
  }

  describe("createRecordingContext", () => {
    it("creates output directory and returns context and page", async () => {
      const { mockBrowser } = createMockBrowser();
      const options = makeOptions();

      const result = await createRecordingContext(mockBrowser, options);

      expect(result.context).toBeDefined();
      expect(result.page).toBeDefined();
    });

    it("passes video recording options to browser context", async () => {
      const { mockBrowser } = createMockBrowser();
      const options = makeOptions();

      await createRecordingContext(mockBrowser, options);

      expect(mockBrowser.newContext).toHaveBeenCalledWith({
        recordVideo: {
          dir: options.outputDir,
          size: options.resolution,
        },
      });
    });

    it("starts tracing with screenshots and snapshots", async () => {
      const { mockBrowser, mockContext } = createMockBrowser();
      const options = makeOptions();

      await createRecordingContext(mockBrowser, options);

      expect(mockContext.tracing.start).toHaveBeenCalledWith({
        screenshots: true,
        snapshots: true,
      });
    });
  });

  describe("finalizeCapture", () => {
    it("returns a CaptureBundle with expected paths", async () => {
      const { mockContext, mockPage } = createMockBrowser();
      const options = makeOptions();

      const events: ActionEvent[] = [
        { action: "click", selector: "#btn", timestamp: 0, duration: 100 },
      ];

      const bundle = await finalizeCapture(mockContext, mockPage, events, options);

      expect(bundle.videoPath).toBe("/tmp/video.webm");
      expect(bundle.tracePath).toBe(join(options.outputDir, "trace.zip"));
      expect(bundle.eventLogPath).toBe(join(options.outputDir, "events.json"));
      expect(bundle.screenshots).toEqual([]);
    });

    it("normalizes video into outputDir/video.webm when the captured file is inside outputDir", async () => {
      const { mockContext, mockPage } = createMockBrowser();
      const options = makeOptions();

      // Create a fake recorded video inside outputDir so finalizeCapture can move it.
      await mkdir(options.outputDir, { recursive: true });
      const recordedPath = join(options.outputDir, "pw-123.webm");
      await writeFile(recordedPath, "fake", "utf-8");
      mockPage.video.mockReturnValue({
        path: vi.fn().mockResolvedValue(recordedPath),
      });

      const bundle = await finalizeCapture(mockContext, mockPage, [], options);

      expect(bundle.videoPath).toBe(join(options.outputDir, "video.webm"));
      const moved = await stat(bundle.videoPath);
      expect(moved.size).toBeGreaterThan(0);
    });

    it("stops tracing and closes context", async () => {
      const { mockContext, mockPage } = createMockBrowser();
      const options = makeOptions();

      await finalizeCapture(mockContext, mockPage, [], options);

      expect(mockContext.tracing.stop).toHaveBeenCalledWith({
        path: join(options.outputDir, "trace.zip"),
      });
      expect(mockContext.close).toHaveBeenCalled();
    });

    it("handles page with no video", async () => {
      const { mockContext, mockPage } = createMockBrowser();
      mockPage.video.mockReturnValue(null);
      const options = makeOptions();

      const bundle = await finalizeCapture(mockContext, mockPage, [], options);

      expect(bundle.videoPath).toBe("");
    });
  });
});
