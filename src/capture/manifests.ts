import { writeFile } from "node:fs/promises";
import process from "node:process";
import type { DemoSpec } from "../spec/types.js";
import type { CaptureBundle, CaptureGeometrySnapshot } from "./types.js";

interface CaptureEnvironmentManifestV1 {
  schemaVersion: 1;
  createdAt: string;
  spec: {
    title: string;
    path?: string;
    baseUrl: string;
    chapterCount: number;
    stepCount: number;
    preStepCount: number;
  };
  browser: {
    name: string;
    headless: boolean;
    strictGeometry: boolean;
    requestedResolution: { width: number; height: number };
    observedGeometry?: CaptureGeometrySnapshot;
  };
  pipeline: {
    renderer: string;
    narrationEnabled: boolean;
    syncMode: string;
    bufferMs: number;
    ttsProvider?: string;
    ttsVoice?: string;
  };
  runtime: {
    platform: NodeJS.Platform;
    arch: string;
    nodeVersion: string;
    timezone: string;
    outputDir: string;
  };
}

export type CaptureEnvironmentManifest = CaptureEnvironmentManifestV1;

interface CaptureVerificationManifestV1 {
  schemaVersion: 1;
  createdAt: string;
  status: "passed" | "failed";
  spec: {
    title: string;
    path?: string;
    chapterCount: number;
    stepCount: number;
  };
  playback: {
    startTimestamp?: number;
    eventCount: number;
    actions: string[];
    preSteps: string[];
    targetStrategies: string[];
  };
  artifacts: {
    videoPath?: string;
    tracePath?: string;
    eventLogPath?: string;
    metadataPath?: string;
    environmentPath?: string;
    verificationPath?: string;
    failureJsonPath?: string;
    failureScreenshotPath?: string;
    failureHtmlPath?: string;
  };
  checks: {
    requiredArtifactsPresent: boolean;
    failureArtifactsPresent?: boolean;
  };
  failure?: {
    name: string;
    message: string;
    chapterTitle?: string | undefined;
    stepIndex?: number | undefined;
    action?: string | undefined;
    selectorForEvent?: string | undefined;
  };
}

export type CaptureVerificationManifest = CaptureVerificationManifestV1;

function uniq(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function countSpecSteps(spec: DemoSpec): number {
  return spec.chapters.reduce((total, chapter) => total + chapter.steps.length, 0);
}

function collectTargetStrategies(spec: DemoSpec): string[] {
  const targetStrategies = new Set<string>();

  const collectTarget = (step: Record<string, unknown> | undefined): void => {
    if (!step) return;
    if (typeof step["selector"] === "string" && step["selector"].trim().length > 0) {
      targetStrategies.add("css");
    }
    const target = step["target"];
    if (typeof target === "object" && target !== null) {
      const targetRecord = target as Record<string, unknown>;
      if (typeof targetRecord["by"] === "string") {
        targetStrategies.add(targetRecord["by"]);
      }
    }
  };

  for (const chapter of spec.chapters) {
    for (const step of chapter.steps) {
      collectTarget(step as Record<string, unknown>);
      const from = (step as Record<string, unknown>)["from"];
      if (typeof from === "object" && from !== null) {
        collectTarget(from as Record<string, unknown>);
      }
      const to = (step as Record<string, unknown>)["to"];
      if (typeof to === "object" && to !== null) {
        collectTarget(to as Record<string, unknown>);
      }
    }
  }

  return uniq(targetStrategies);
}

function collectActions(spec: DemoSpec): string[] {
  return uniq(spec.chapters.flatMap((chapter) => chapter.steps.map((step) => step.action)));
}

function collectPreSteps(spec: DemoSpec): string[] {
  return uniq((spec.preSteps ?? []).map((step) => step.action));
}

export function buildCaptureEnvironmentManifest(params: {
  spec: DemoSpec;
  specPath?: string | undefined;
  baseUrl: string;
  outputDir: string;
  browserName: string;
  headless: boolean;
  strictGeometry: boolean;
  resolution: { width: number; height: number };
  observedGeometry?: CaptureGeometrySnapshot;
  renderer: string;
  narrationEnabled: boolean;
  narrationSyncMode: string;
  narrationBufferMs: number;
  ttsProvider?: string;
  ttsVoice?: string;
}): CaptureEnvironmentManifest {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    spec: {
      title: params.spec.meta.title,
      ...(params.specPath ? { path: params.specPath } : {}),
      baseUrl: params.baseUrl,
      chapterCount: params.spec.chapters.length,
      stepCount: countSpecSteps(params.spec),
      preStepCount: params.spec.preSteps?.length ?? 0,
    },
    browser: {
      name: params.browserName,
      headless: params.headless,
      strictGeometry: params.strictGeometry,
      requestedResolution: params.resolution,
      ...(params.observedGeometry ? { observedGeometry: params.observedGeometry } : {}),
    },
    pipeline: {
      renderer: params.renderer,
      narrationEnabled: params.narrationEnabled,
      syncMode: params.narrationSyncMode,
      bufferMs: params.narrationBufferMs,
      ...(params.ttsProvider ? { ttsProvider: params.ttsProvider } : {}),
      ...(params.ttsVoice ? { ttsVoice: params.ttsVoice } : {}),
    },
    runtime: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "unknown",
      outputDir: params.outputDir,
    },
  };
}

type VerificationParams = {
  status: "passed" | "failed";
  spec: DemoSpec;
  specPath?: string | undefined;
  eventCount: number;
  startTimestamp?: number | undefined;
  bundle?: CaptureBundle | undefined;
  environmentPath?: string | undefined;
  verificationPath?: string | undefined;
  failureArtifacts?:
    | {
        jsonPath: string;
        screenshotPath?: string | undefined;
        htmlPath?: string | undefined;
      }
    | undefined;
  failure?: {
    name: string;
    message: string;
    chapterTitle?: string | undefined;
    stepIndex?: number | undefined;
    action?: string | undefined;
    selectorForEvent?: string | undefined;
  };
};

type ArtifactPaths = CaptureVerificationManifestV1["artifacts"];

function buildArtifactPaths(params: VerificationParams): ArtifactPaths {
  const fa = params.failureArtifacts;
  return {
    ...(params.bundle?.videoPath ? { videoPath: params.bundle.videoPath } : {}),
    ...(params.bundle?.tracePath ? { tracePath: params.bundle.tracePath } : {}),
    ...(params.bundle?.eventLogPath ? { eventLogPath: params.bundle.eventLogPath } : {}),
    ...(params.bundle?.metadataPath ? { metadataPath: params.bundle.metadataPath } : {}),
    ...(params.environmentPath ? { environmentPath: params.environmentPath } : {}),
    ...(params.verificationPath ? { verificationPath: params.verificationPath } : {}),
    ...(fa?.jsonPath ? { failureJsonPath: fa.jsonPath } : {}),
    ...(fa?.screenshotPath ? { failureScreenshotPath: fa.screenshotPath } : {}),
    ...(fa?.htmlPath ? { failureHtmlPath: fa.htmlPath } : {}),
  };
}

function buildChecks(
  status: "passed" | "failed",
  artifacts: ArtifactPaths,
): CaptureVerificationManifestV1["checks"] {
  const requiredArtifactsPresent =
    typeof artifacts.tracePath === "string" &&
    typeof artifacts.eventLogPath === "string" &&
    typeof artifacts.metadataPath === "string" &&
    typeof artifacts.environmentPath === "string" &&
    (status === "failed" || typeof artifacts.videoPath === "string");

  if (status !== "failed") return { requiredArtifactsPresent };

  const failureArtifactsPresent =
    typeof artifacts.failureJsonPath === "string" &&
    typeof artifacts.failureScreenshotPath === "string" &&
    typeof artifacts.failureHtmlPath === "string";

  return { requiredArtifactsPresent, failureArtifactsPresent };
}

export function buildCaptureVerificationManifest(
  params: VerificationParams,
): CaptureVerificationManifest {
  const artifacts = buildArtifactPaths(params);
  const checks = buildChecks(params.status, artifacts);

  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    status: params.status,
    spec: {
      title: params.spec.meta.title,
      ...(params.specPath ? { path: params.specPath } : {}),
      chapterCount: params.spec.chapters.length,
      stepCount: countSpecSteps(params.spec),
    },
    playback: {
      ...(params.startTimestamp !== undefined ? { startTimestamp: params.startTimestamp } : {}),
      eventCount: params.eventCount,
      actions: collectActions(params.spec),
      preSteps: collectPreSteps(params.spec),
      targetStrategies: collectTargetStrategies(params.spec),
    },
    artifacts,
    checks,
    ...(params.failure ? { failure: params.failure } : {}),
  };
}

export async function writeCaptureEnvironment(
  manifest: CaptureEnvironmentManifest,
  outputPath: string,
): Promise<void> {
  await writeFile(outputPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}

export async function writeCaptureVerification(
  manifest: CaptureVerificationManifest,
  outputPath: string,
): Promise<void> {
  await writeFile(outputPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}
