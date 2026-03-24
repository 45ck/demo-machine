import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { DemoSpec } from "../spec/types.js";
import type { ActionEvent } from "../playback/types.js";
import type { PlaywrightPage } from "../playback/actions.js";
import { createLogger } from "../utils/logger.js";
import { PlaybackStepError } from "../playback/errors.js";
import {
  buildCaptureEnvironmentManifest,
  buildCaptureVerificationManifest,
  writeCaptureEnvironment,
  writeCaptureVerification,
} from "../capture/manifests.js";
import type { CaptureBundle, CaptureGeometrySnapshot } from "../capture/types.js";
import type { CaptureMetadata } from "../capture/metadata.js";
import type { GlobalOptions } from "./options.js";
import type { NarrationSettings } from "./narration.js";

const log = createLogger("cli:capture:artifacts");
type CaptureRecorderModule = typeof import("../capture/recorder.js");

interface CaptureFailureSummary {
  name: string;
  message: string;
  chapterTitle?: string | undefined;
  stepIndex?: number | undefined;
  action?: string | undefined;
  selectorForEvent?: string | undefined;
  events?: ActionEvent[] | undefined;
  startTimestamp?: number | undefined;
  cause?: { name?: string; message: string; stack?: string } | undefined;
}

interface FailureArtifacts {
  jsonPath: string;
  screenshotPath?: string;
  htmlPath?: string;
}

function stringifyCause(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  try {
    return JSON.stringify(v);
  } catch {
    return "[unserializable cause]";
  }
}

export function buildFailureSummary(err: unknown): CaptureFailureSummary {
  const stepErr = err instanceof PlaybackStepError ? err : undefined;
  const message = (err as Error | undefined)?.message ?? String(err);
  const causeValue =
    stepErr && "cause" in stepErr ? (stepErr as unknown as { cause?: unknown }).cause : undefined;
  const cause =
    causeValue instanceof Error
      ? {
          name: causeValue.name,
          message: causeValue.message,
          ...(causeValue.stack ? { stack: causeValue.stack } : {}),
        }
      : causeValue !== undefined
        ? { message: stringifyCause(causeValue) }
        : undefined;

  return {
    name: stepErr?.name ?? (err as Error | undefined)?.name ?? "Error",
    message,
    chapterTitle: stepErr?.chapterTitle,
    stepIndex: stepErr?.stepIndex,
    action: stepErr?.step?.action,
    selectorForEvent: stepErr?.selectorForEvent,
    events: stepErr?.events,
    startTimestamp: stepErr?.startTimestamp,
    cause,
  };
}

export async function writeFailureArtifacts(params: {
  page: PlaywrightPage;
  outDir: string;
  failure: CaptureFailureSummary;
}): Promise<FailureArtifacts> {
  await mkdir(params.outDir, { recursive: true });
  const failureArtifacts: FailureArtifacts = {
    jsonPath: path.join(params.outDir, "failure.json"),
  };

  try {
    failureArtifacts.screenshotPath = path.join(params.outDir, "failure.png");
    await params.page.screenshot({ path: failureArtifacts.screenshotPath });
  } catch (sErr) {
    delete failureArtifacts.screenshotPath;
    log.warn(`Failed to capture failure screenshot: ${String(sErr)}`);
  }

  try {
    const html = (await params.page.evaluate(
      (() => document.documentElement.outerHTML) as (...args: unknown[]) => unknown,
    )) as string;
    failureArtifacts.htmlPath = path.join(params.outDir, "failure.html");
    await writeFile(failureArtifacts.htmlPath, html, "utf-8");
  } catch (hErr) {
    delete failureArtifacts.htmlPath;
    log.warn(`Failed to capture failure HTML: ${String(hErr)}`);
  }

  await writeFile(
    failureArtifacts.jsonPath,
    JSON.stringify(params.failure, null, 2) + "\n",
    "utf-8",
  );
  return failureArtifacts;
}

function resolveSpecPath(specPath?: string): string | undefined {
  return specPath ? path.resolve(specPath) : undefined;
}

function createCaptureMetadata(specTitle: string, startTimestamp: number): CaptureMetadata {
  return {
    schemaVersion: 1,
    startTimestamp,
    createdAt: new Date().toISOString(),
    specTitle,
  };
}

export async function finalizeCaptureSafe(params: {
  captureMod: CaptureRecorderModule;
  recording: { context: unknown; page: unknown };
  events: ActionEvent[];
  captureOpts: { outputDir: string; resolution: DemoSpec["meta"]["resolution"] };
  specTitle: string;
  startTimestamp: number;
}): Promise<CaptureBundle | undefined> {
  try {
    return await params.captureMod.finalizeCapture(
      params.recording.context as never,
      params.recording.page as never,
      params.events,
      {
        ...params.captureOpts,
        meta: createCaptureMetadata(params.specTitle, params.startTimestamp),
      },
    );
  } catch (err) {
    log.warn(`Failed to finalize capture: ${String(err)}`);
    return undefined;
  }
}

export async function writeCaptureEnvironmentArtifact(params: {
  spec: DemoSpec;
  specPath?: string;
  baseUrl: string;
  outputDir: string;
  resolution: { width: number; height: number };
  observedGeometry?: CaptureGeometrySnapshot;
  opts: Pick<GlobalOptions, "headless" | "strictGeometry" | "renderer">;
  settings: NarrationSettings;
}): Promise<string> {
  const environmentPath = path.join(params.outputDir, "environment.json");
  await writeCaptureEnvironment(
    buildCaptureEnvironmentManifest({
      spec: params.spec,
      ...(resolveSpecPath(params.specPath) ? { specPath: resolveSpecPath(params.specPath) } : {}),
      baseUrl: params.baseUrl,
      outputDir: path.resolve(params.outputDir),
      browserName: "chromium",
      headless: params.opts.headless,
      strictGeometry: params.opts.strictGeometry,
      resolution: params.resolution,
      ...(params.observedGeometry ? { observedGeometry: params.observedGeometry } : {}),
      renderer: params.opts.renderer,
      narrationEnabled: params.settings.enabled,
      narrationSyncMode: params.settings.syncMode,
      narrationBufferMs: params.settings.bufferMs,
      ttsProvider: params.settings.provider,
      ...(params.settings.voice ? { ttsVoice: params.settings.voice } : {}),
    }),
    environmentPath,
  );
  return environmentPath;
}

export async function writePassedVerificationArtifact(params: {
  spec: DemoSpec;
  specPath?: string;
  outputDir: string;
  eventCount: number;
  startTimestamp: number;
  bundle: CaptureBundle;
  environmentPath: string;
}): Promise<string> {
  const verificationPath = path.join(params.outputDir, "verification.json");
  await writeCaptureVerification(
    buildCaptureVerificationManifest({
      status: "passed",
      spec: params.spec,
      ...(resolveSpecPath(params.specPath) ? { specPath: resolveSpecPath(params.specPath) } : {}),
      eventCount: params.eventCount,
      startTimestamp: params.startTimestamp,
      bundle: {
        ...params.bundle,
        environmentPath: params.environmentPath,
        verificationPath,
      },
      environmentPath: params.environmentPath,
      verificationPath,
    }),
    verificationPath,
  );
  return verificationPath;
}

export async function handleCaptureFailure(params: {
  captureMod: CaptureRecorderModule;
  recording: { context: unknown; page: unknown };
  page: PlaywrightPage;
  captureOpts: { outputDir: string; resolution: DemoSpec["meta"]["resolution"] };
  spec: DemoSpec;
  specPath?: string | undefined;
  environmentPath: string;
  err: unknown;
}): Promise<never> {
  const failure = buildFailureSummary(params.err);
  const failureArtifacts = await writeFailureArtifacts({
    page: params.page,
    outDir: params.captureOpts.outputDir,
    failure,
  });
  const bundle = await finalizeCaptureSafe({
    captureMod: params.captureMod,
    recording: params.recording,
    events: failure.events ?? [],
    captureOpts: params.captureOpts,
    specTitle: params.spec.meta.title,
    startTimestamp: failure.startTimestamp ?? Date.now(),
  });
  await writeFailedVerificationArtifact({
    spec: params.spec,
    ...(params.specPath ? { specPath: params.specPath } : {}),
    outputDir: params.captureOpts.outputDir,
    eventCount: failure.events?.length ?? 0,
    startTimestamp: failure.startTimestamp,
    ...(bundle ? { bundle } : {}),
    environmentPath: params.environmentPath,
    failureArtifacts,
    failure,
  });
  throw params.err;
}

async function writeFailedVerificationArtifact(params: {
  spec: DemoSpec;
  specPath?: string;
  outputDir: string;
  eventCount: number;
  startTimestamp?: number | undefined;
  bundle?: CaptureBundle;
  environmentPath: string;
  failureArtifacts: FailureArtifacts;
  failure: CaptureFailureSummary;
}): Promise<string> {
  const verificationPath = path.join(params.outputDir, "verification.json");
  await writeCaptureVerification(
    buildCaptureVerificationManifest({
      status: "failed",
      spec: params.spec,
      ...(resolveSpecPath(params.specPath) ? { specPath: resolveSpecPath(params.specPath) } : {}),
      eventCount: params.eventCount,
      startTimestamp: params.startTimestamp,
      ...(params.bundle
        ? {
            bundle: {
              ...params.bundle,
              environmentPath: params.environmentPath,
              verificationPath,
            },
          }
        : {}),
      environmentPath: params.environmentPath,
      verificationPath,
      failureArtifacts: params.failureArtifacts,
      failure: params.failure,
    }),
    verificationPath,
  );
  return verificationPath;
}
