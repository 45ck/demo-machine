import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import {
  buildFailureSummary,
  finalizeCaptureSafe,
  handleCaptureFailure,
  writeCaptureEnvironmentArtifact,
  writeFailureArtifacts,
  writePassedVerificationArtifact,
} from "../../src/cli/capture-artifacts.js";
import { PlaybackStepError } from "../../src/playback/errors.js";
import type { ActionEvent } from "../../src/playback/types.js";
import type { CaptureBundle } from "../../src/capture/types.js";
import type { DemoSpec } from "../../src/spec/types.js";

function makeSpec(): DemoSpec {
  return {
    meta: {
      title: "Artifact Demo",
      resolution: { width: 1280, height: 720 },
    },
    runner: {
      url: "http://localhost:3000",
    },
    chapters: [
      {
        title: "Checkout",
        steps: [
          { action: "navigate", url: "/" },
          { action: "click", selector: "#pay" },
        ],
      },
    ],
  } as DemoSpec;
}

async function writeArtifact(tempDir: string, name: string, contents = name): Promise<string> {
  const filePath = join(tempDir, name);
  await writeFile(filePath, contents, "utf-8");
  return filePath;
}

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

  it("writes environment.json and passed verification.json with stable shapes", async () => {
    const spec = makeSpec();
    const environmentPath = await writeCaptureEnvironmentArtifact({
      spec,
      baseUrl: "http://localhost:3000",
      outputDir: tempDir,
      resolution: { width: 1280, height: 720 },
      observedGeometry: {
        innerWidth: 1280,
        innerHeight: 720,
        outerWidth: 1280,
        outerHeight: 720,
        availWidth: 1280,
        availHeight: 720,
        devicePixelRatio: 1,
      },
      opts: {
        headless: true,
        strictGeometry: true,
        renderer: "ffmpeg",
      },
      settings: {
        enabled: false,
        provider: "kokoro",
        syncMode: "manual",
        bufferMs: 500,
      },
    });
    const bundle: CaptureBundle = {
      videoPath: await writeArtifact(tempDir, "video.webm"),
      tracePath: await writeArtifact(tempDir, "trace.zip"),
      eventLogPath: await writeArtifact(tempDir, "events.json", "[]"),
      metadataPath: await writeArtifact(tempDir, "metadata.json", "{}"),
      screenshots: [],
    };

    const verificationPath = await writePassedVerificationArtifact({
      spec,
      outputDir: tempDir,
      eventCount: 2,
      startTimestamp: 1234,
      bundle,
      environmentPath,
    });

    const environment = JSON.parse(await readFile(environmentPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(environment).toMatchObject({
      schemaVersion: 1,
      spec: { title: "Artifact Demo", baseUrl: "http://localhost:3000", stepCount: 2 },
      browser: {
        name: "chromium",
        headless: true,
        strictGeometry: true,
        requestedResolution: { width: 1280, height: 720 },
      },
      pipeline: {
        renderer: "ffmpeg",
        narrationEnabled: false,
        syncMode: "manual",
        bufferMs: 500,
      },
    });
    expect(typeof environment["createdAt"]).toBe("string");

    const verification = JSON.parse(await readFile(verificationPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(verification).toMatchObject({
      schemaVersion: 1,
      status: "passed",
      spec: { title: "Artifact Demo", chapterCount: 1, stepCount: 2 },
      playback: {
        startTimestamp: 1234,
        eventCount: 2,
        actions: ["click", "navigate"],
      },
      artifacts: {
        videoPath: bundle.videoPath,
        tracePath: bundle.tracePath,
        eventLogPath: bundle.eventLogPath,
        metadataPath: bundle.metadataPath,
        environmentPath,
        verificationPath,
      },
      checks: {
        requiredArtifactsPresent: true,
      },
    });
    expect(typeof verification["createdAt"]).toBe("string");
  });

  it("writes failed verification.json with failure artifacts and partial events", async () => {
    const spec = makeSpec();
    const environmentPath = await writeArtifact(tempDir, "environment.json", "{}");
    const partialEvents: ActionEvent[] = [{ action: "navigate", timestamp: 10, duration: 20 }];
    const error = new PlaybackStepError({
      chapterTitle: "Checkout",
      stepIndex: 1,
      step: { action: "click", selector: "#pay" },
      selectorForEvent: "#pay",
      startTimestamp: 1234,
      events: partialEvents,
      cause: new Error("missing"),
    });
    const page = {
      screenshot: vi.fn(async ({ path }: { path: string }) => {
        await writeFile(path, "png", "utf-8");
      }),
      evaluate: vi.fn().mockResolvedValue("<html><body>failed</body></html>"),
    };
    const captureMod = {
      finalizeCapture: vi.fn(async () => {
        const bundle: CaptureBundle = {
          videoPath: "",
          tracePath: await writeArtifact(tempDir, "trace.zip"),
          eventLogPath: await writeArtifact(tempDir, "events.json", JSON.stringify(partialEvents)),
          metadataPath: await writeArtifact(tempDir, "metadata.json", "{}"),
          screenshots: [],
        };
        return bundle;
      }),
    };

    await expect(
      handleCaptureFailure({
        captureMod: captureMod as never,
        recording: { context: {}, page: {} },
        page: page as never,
        captureOpts: {
          outputDir: tempDir,
          resolution: { width: 1280, height: 720 },
        },
        spec,
        environmentPath,
        err: error,
      }),
    ).rejects.toThrow("Playback failed at step 1");

    const verificationPath = join(tempDir, "verification.json");
    const verification = JSON.parse(await readFile(verificationPath, "utf8")) as {
      status: string;
      playback: { eventCount: number };
      artifacts: Record<string, string>;
      checks: { requiredArtifactsPresent: boolean; failureArtifactsPresent: boolean };
      failure: { action: string; selectorForEvent: string };
    };
    expect(verification.status).toBe("failed");
    expect(verification.playback.eventCount).toBe(1);
    expect(verification.checks.requiredArtifactsPresent).toBe(true);
    expect(verification.checks.failureArtifactsPresent).toBe(true);
    expect(verification.failure).toMatchObject({
      action: "click",
      selectorForEvent: "#pay",
    });
    expect(verification.artifacts.failureJsonPath).toBe(join(tempDir, "failure.json"));
    expect(verification.artifacts.failureScreenshotPath).toBe(join(tempDir, "failure.png"));
    expect(verification.artifacts.failureHtmlPath).toBe(join(tempDir, "failure.html"));

    const failureJson = JSON.parse(
      await readFile(verification.artifacts.failureJsonPath, "utf8"),
    ) as {
      events: ActionEvent[];
    };
    expect(failureJson.events).toEqual(partialEvents);
    await expect(readFile(verification.artifacts.failureScreenshotPath, "utf8")).resolves.toBe(
      "png",
    );
    await expect(readFile(verification.artifacts.failureHtmlPath, "utf8")).resolves.toContain(
      "failed",
    );
  });
});
