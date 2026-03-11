import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import {
  buildFailureSummary,
  finalizeCaptureSafe,
  writeFailureArtifacts,
} from "../../src/cli/capture-artifacts.js";
import { PlaybackStepError } from "../../src/playback/errors.js";
import type { ActionEvent } from "../../src/playback/types.js";

describe("capture-artifacts", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "capture-artifacts-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("builds a structured failure summary from PlaybackStepError", () => {
    const events: ActionEvent[] = [
      { action: "click", selector: "#save", timestamp: 1, duration: 2 },
    ];
    const error = new PlaybackStepError({
      chapterTitle: "Checkout",
      stepIndex: 3,
      step: { action: "click", selector: "#save" },
      selectorForEvent: "#save",
      startTimestamp: 1234,
      events,
      cause: new Error("not found"),
    });

    const summary = buildFailureSummary(error);

    expect(summary.name).toBe("PlaybackStepError");
    expect(summary.chapterTitle).toBe("Checkout");
    expect(summary.stepIndex).toBe(3);
    expect(summary.action).toBe("click");
    expect(summary.selectorForEvent).toBe("#save");
    expect(summary.startTimestamp).toBe(1234);
    expect(summary.events).toEqual(events);
    expect(summary.cause?.message).toBe("not found");
  });

  it("writes failure screenshot, html, and json artifacts", async () => {
    const page = {
      screenshot: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue("<html><body>broken</body></html>"),
    };

    const artifacts = await writeFailureArtifacts({
      page: page as never,
      outDir: tempDir,
      failure: {
        name: "PlaybackStepError",
        message: "selector missing",
        action: "click",
      },
    });

    expect(page.screenshot).toHaveBeenCalledWith({ path: join(tempDir, "failure.png") });
    expect(artifacts.jsonPath).toBe(join(tempDir, "failure.json"));
    expect(artifacts.screenshotPath).toBe(join(tempDir, "failure.png"));
    expect(artifacts.htmlPath).toBe(join(tempDir, "failure.html"));

    const json = JSON.parse(await readFile(artifacts.jsonPath, "utf8")) as Record<string, unknown>;
    expect(json["message"]).toBe("selector missing");
    const html = await readFile(artifacts.htmlPath!, "utf8");
    expect(html).toContain("broken");
  });

  it("returns undefined when finalizeCaptureSafe catches finalize errors", async () => {
    const captureMod = {
      finalizeCapture: vi.fn().mockRejectedValue(new Error("disk full")),
    };

    const result = await finalizeCaptureSafe({
      captureMod: captureMod as never,
      recording: { context: {}, page: {} },
      events: [],
      captureOpts: {
        outputDir: tempDir,
        resolution: { width: 1920, height: 1080 },
      },
      specTitle: "Broken Demo",
      startTimestamp: 1000,
    });

    expect(result).toBeUndefined();
    expect(captureMod.finalizeCapture).toHaveBeenCalledOnce();
  });
});
