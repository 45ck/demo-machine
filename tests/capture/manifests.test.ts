import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCaptureEnvironmentManifest,
  buildCaptureVerificationManifest,
} from "../../src/capture/manifests.js";
import type { CaptureBundle } from "../../src/capture/types.js";
import type { DemoSpec } from "../../src/spec/types.js";

function makeSpec(): DemoSpec {
  return {
    meta: {
      title: "Manifest Demo",
      resolution: { width: 1280, height: 720 },
    },
    runner: {
      url: "http://localhost:4999",
    },
    preSteps: [
      { action: "setCookie", name: "demo-session", value: "token" },
      { action: "setLocalStorage", key: "seeded_count", value: "3" },
    ],
    chapters: [
      {
        title: "Open",
        steps: [
          { action: "navigate", url: "/" },
          {
            action: "click",
            target: { by: "role", role: "button", name: "Continue" },
          },
          {
            action: "dragAndDrop",
            from: { target: { by: "testId", testId: "drag-source" } },
            to: { selector: ".drop-zone" },
          },
        ],
      },
    ],
  } as DemoSpec;
}

describe("capture manifests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "capture-manifests-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function writeArtifact(name: string, contents = name): Promise<string> {
    const filePath = join(tempDir, name);
    await writeFile(filePath, contents, "utf-8");
    return filePath;
  }

  it("builds an environment manifest with runtime and browser details", () => {
    const spec = makeSpec();
    const manifest = buildCaptureEnvironmentManifest({
      spec,
      specPath: "C:\\demo-machine\\examples\\seeded-api.demo.yaml",
      baseUrl: "http://localhost:4999",
      outputDir: "C:\\demo-machine\\output\\seeded-api",
      browserName: "chromium",
      headless: true,
      strictGeometry: true,
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
      renderer: "ffmpeg",
      narrationEnabled: false,
      narrationSyncMode: "manual",
      narrationBufferMs: 500,
      ttsProvider: "kokoro",
    });

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.spec.title).toBe("Manifest Demo");
    expect(manifest.spec.stepCount).toBe(3);
    expect(manifest.browser.requestedResolution).toEqual({ width: 1280, height: 720 });
    expect(manifest.browser.observedGeometry?.innerWidth).toBe(1280);
    expect(manifest.pipeline.renderer).toBe("ffmpeg");
    expect(manifest.pipeline.narrationEnabled).toBe(false);
  });

  it("builds a passed verification manifest with collected proof details", async () => {
    const spec = makeSpec();
    const bundle: CaptureBundle = {
      videoPath: await writeArtifact("video.webm"),
      tracePath: await writeArtifact("trace.zip"),
      eventLogPath: await writeArtifact("events.json", "[]"),
      metadataPath: await writeArtifact("metadata.json", "{}"),
      screenshotManifestPath: await writeArtifact("screenshot-manifest.json", "{}"),
      screenshots: [
        await writeArtifact("step-0000.png"),
        await writeArtifact("assert-0001-before.png"),
      ],
    };
    const environmentPath = await writeArtifact("environment.json", "{}");
    const verificationPath = join(tempDir, "verification.json");

    const manifest = buildCaptureVerificationManifest({
      status: "passed",
      spec,
      specPath: "C:\\demo-machine\\examples\\seeded-api.demo.yaml",
      eventCount: 3,
      startTimestamp: 1234567890,
      bundle,
      environmentPath,
      verificationPath,
    });

    expect(manifest.status).toBe("passed");
    expect(manifest.playback.actions).toEqual(["click", "dragAndDrop", "navigate"]);
    expect(manifest.playback.preSteps).toEqual(["setCookie", "setLocalStorage"]);
    expect(manifest.playback.targetStrategies).toEqual(["css", "role", "testId"]);
    expect(manifest.artifacts.screenshotManifestPath).toBe(bundle.screenshotManifestPath);
    expect(manifest.artifacts.screenshotPaths).toEqual(bundle.screenshots);
    expect(manifest.checks.requiredArtifactsPresent).toBe(true);
    expect(manifest.checks.missingRequiredArtifacts).toBeUndefined();
  });

  it("marks failed verification manifests when required failure artifacts are missing", () => {
    const manifest = buildCaptureVerificationManifest({
      status: "failed",
      spec: makeSpec(),
      eventCount: 0,
      environmentPath: "C:\\demo-machine\\output\\environment.json",
      failureArtifacts: {
        jsonPath: "C:\\demo-machine\\output\\failure.json",
      },
      failure: {
        name: "PlaybackStepError",
        message: "target not found",
        action: "click",
      },
    });

    expect(manifest.checks.requiredArtifactsPresent).toBe(false);
    expect(manifest.checks.missingRequiredArtifacts).toEqual([
      "tracePath",
      "eventLogPath",
      "metadataPath",
      "environmentPath",
    ]);
    expect(manifest.checks.failureArtifactsPresent).toBe(false);
    expect(manifest.checks.missingFailureArtifacts).toEqual([
      "failureJsonPath",
      "failureScreenshotPath",
      "failureHtmlPath",
    ]);
    expect(manifest.failure?.action).toBe("click");
  });

  it("marks returned artifact paths missing when files are absent on disk", async () => {
    const environmentPath = await writeArtifact("environment.json", "{}");
    const manifest = buildCaptureVerificationManifest({
      status: "passed",
      spec: makeSpec(),
      eventCount: 1,
      bundle: {
        videoPath: join(tempDir, "missing-video.webm"),
        tracePath: await writeArtifact("trace.zip"),
        eventLogPath: await writeArtifact("events.json", "[]"),
        metadataPath: await writeArtifact("metadata.json", "{}"),
        screenshots: [],
      },
      environmentPath,
    });

    expect(manifest.checks.requiredArtifactsPresent).toBe(false);
    expect(manifest.checks.missingRequiredArtifacts).toEqual(["videoPath"]);
  });
});
