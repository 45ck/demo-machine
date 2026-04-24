import { describe, expect, it } from "vitest";
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

  it("builds a passed verification manifest with collected proof details", () => {
    const spec = makeSpec();
    const bundle: CaptureBundle = {
      videoPath: "C:\\demo-machine\\output\\video.webm",
      tracePath: "C:\\demo-machine\\output\\trace.zip",
      eventLogPath: "C:\\demo-machine\\output\\events.json",
      metadataPath: "C:\\demo-machine\\output\\metadata.json",
      screenshotManifestPath: "C:\\demo-machine\\output\\screenshots\\manifest.json",
      screenshots: [
        "C:\\demo-machine\\output\\screenshots\\step-0000.png",
        "C:\\demo-machine\\output\\screenshots\\assert-0001-before.png",
      ],
    };

    const manifest = buildCaptureVerificationManifest({
      status: "passed",
      spec,
      specPath: "C:\\demo-machine\\examples\\seeded-api.demo.yaml",
      eventCount: 3,
      startTimestamp: 1234567890,
      bundle,
      environmentPath: "C:\\demo-machine\\output\\environment.json",
      verificationPath: "C:\\demo-machine\\output\\verification.json",
    });

    expect(manifest.status).toBe("passed");
    expect(manifest.playback.actions).toEqual(["click", "dragAndDrop", "navigate"]);
    expect(manifest.playback.preSteps).toEqual(["setCookie", "setLocalStorage"]);
    expect(manifest.playback.targetStrategies).toEqual(["css", "role", "testId"]);
    expect(manifest.artifacts.screenshotManifestPath).toBe(
      "C:\\demo-machine\\output\\screenshots\\manifest.json",
    );
    expect(manifest.artifacts.screenshotPaths).toEqual([
      "C:\\demo-machine\\output\\screenshots\\step-0000.png",
      "C:\\demo-machine\\output\\screenshots\\assert-0001-before.png",
    ]);
    expect(manifest.checks.requiredArtifactsPresent).toBe(true);
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
    expect(manifest.checks.failureArtifactsPresent).toBe(false);
    expect(manifest.failure?.action).toBe("click");
  });
});
