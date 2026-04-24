import { readFile, writeFile } from "node:fs/promises";
import type { DemoSpec } from "../spec/types.js";
import type { QualityGateResult } from "../quality/runner.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("cli:pipeline");
const QUALITY_REPORT_PREFIX = "Quality report:";

interface ScreenshotData {
  stepScreenshots?: Map<number, Buffer>;
  assertScreenshotPairs?: Array<{ stepIndex: number; before: Buffer; after: Buffer }>;
  cursorPositions?: Array<{
    stepIndex: number;
    cursorX: number;
    cursorY: number;
    targetCenterX: number;
    targetCenterY: number;
  }>;
  chapterTitleScreenshots?: Map<number, Buffer>;
}

interface RunPostRenderQualityGateParams {
  outputPath: string;
  outputDir?: string | undefined;
  verificationPath?: string | undefined;
  spec: DemoSpec;
  events?: import("../playback/types.js").ActionEvent[];
  narrationSegments?: import("../narration/types.js").TimedNarrationSegment[];
  startTimestamp?: number;
  screenshotData?: ScreenshotData;
}

interface PostRenderQualityGateSummary {
  qualityReportPath?: string | undefined;
  status: "pass" | "warn" | "fail";
}

/** Build narration-to-action index lookup by walking spec chapters. */
function buildNarrationToActionMap(spec: DemoSpec): number[] {
  const map: number[] = [];
  let stepIdx = 0;
  for (const chapter of spec.chapters ?? []) {
    for (const step of chapter.steps ?? []) {
      if (step.narration) map.push(stepIdx);
      stepIdx++;
    }
  }
  return map;
}

/** Prepare quality-gate inputs from capture events and narration segments. */
function buildQualityGateInputs(params: {
  spec: DemoSpec;
  events: import("../playback/types.js").ActionEvent[];
  narrationSegments: import("../narration/types.js").TimedNarrationSegment[];
  startTimestamp: number;
}): {
  events: Array<{ action: string; timestamp: number; duration: number }>;
  narrationSegments: Array<{ actionIndex: number; startMs: number; text: string }>;
} {
  const t0 = params.startTimestamp;
  const events = params.events.map((e) => ({
    action: e.action,
    timestamp: e.timestamp - t0,
    duration: e.duration,
  }));
  const narrationToAction = buildNarrationToActionMap(params.spec);
  const narrationSegments = params.narrationSegments.map((seg, i) => ({
    actionIndex: narrationToAction[i] ?? i,
    startMs: seg.startMs,
    text: seg.text,
  }));
  return { events, narrationSegments };
}

async function writeQualityReport(params: {
  outputDir: string | undefined;
  outputPath: string;
  gate: QualityGateResult;
}): Promise<string | undefined> {
  if (!params.outputDir) return undefined;
  const reportMod = await import("../quality/report.js");
  const reportPath = await reportMod.writeQualityGateReport({
    outputDir: params.outputDir,
    outputPath: params.outputPath,
    gate: params.gate,
  });
  log.info(`${QUALITY_REPORT_PREFIX} ${reportPath}`);
  return reportPath;
}

async function writeQualityErrorReport(params: {
  outputDir: string | undefined;
  outputPath: string;
  error: unknown;
}): Promise<string | undefined> {
  if (!params.outputDir) return undefined;
  const reportMod = await import("../quality/report.js");
  const reportPath = await reportMod.writeQualityGateErrorReport({
    outputDir: params.outputDir,
    outputPath: params.outputPath,
    error: params.error,
  });
  log.info(`${QUALITY_REPORT_PREFIX} ${reportPath}`);
  return reportPath;
}

function qualityStatus(gate: QualityGateResult): "pass" | "warn" | "fail" {
  if (gate.hasFailures) return "fail";
  return gate.results.some((r) => r.status === "warn") ? "warn" : "pass";
}

async function updateVerificationQuality(params: {
  verificationPath: string | undefined;
  qualityReportPath: string | undefined;
  status: "pass" | "warn" | "fail";
}): Promise<void> {
  if (!params.verificationPath) return;
  try {
    const parsed = JSON.parse(await readFile(params.verificationPath, "utf-8")) as Record<
      string,
      unknown
    >;
    const artifacts =
      typeof parsed["artifacts"] === "object" && parsed["artifacts"] !== null
        ? (parsed["artifacts"] as Record<string, unknown>)
        : {};
    const checks =
      typeof parsed["checks"] === "object" && parsed["checks"] !== null
        ? (parsed["checks"] as Record<string, unknown>)
        : {};

    if (params.qualityReportPath) artifacts["qualityReportPath"] = params.qualityReportPath;
    checks["postRenderQualityPassed"] = params.status !== "fail";
    checks["postRenderQualityStatus"] = params.status;
    parsed["artifacts"] = artifacts;
    parsed["checks"] = checks;
    await writeFile(params.verificationPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
  } catch (err) {
    log.warn(`Failed to update verification quality summary: ${String(err)}`);
  }
}

function logNonPassingResults(gate: QualityGateResult): void {
  for (const result of gate.results) {
    if (result.status !== "pass") {
      log.warn(`[quality] ${result.checkName}: ${result.message}`);
    }
  }
}

function throwIfQualityFailed(gate: QualityGateResult): void {
  if (!gate.hasFailures) return;
  const failures = gate.results.filter((r) => r.status === "fail");
  const failureSummary = failures.map((r) => `  - ${r.checkName}: ${r.message}`).join("\n");
  throw new Error(
    `Quality gate failed: ${String(failures.length)} check(s) failed out of ${String(gate.results.length)}\n${failureSummary}`,
  );
}

function logQualitySummary(gate: QualityGateResult): void {
  const warnCount = gate.results.filter((r) => r.status === "warn").length;
  if (warnCount > 0) {
    log.info(
      `Quality gate warning: ${String(warnCount)} warning(s), 0 failures (${gate.results.length} checks, ${gate.durationMs}ms)`,
    );
    return;
  }
  log.info(`Quality gate passed (${gate.results.length} checks, ${gate.durationMs}ms)`);
}

export async function runPostRenderQualityGate(
  params: RunPostRenderQualityGateParams,
): Promise<PostRenderQualityGateSummary> {
  const qualityMod = await import("../quality/runner.js");

  try {
    const inputs =
      params.events && params.narrationSegments && params.startTimestamp !== undefined
        ? buildQualityGateInputs({
            spec: params.spec,
            events: params.events,
            narrationSegments: params.narrationSegments,
            startTimestamp: params.startTimestamp,
          })
        : undefined;

    const gate = await qualityMod.runQualityGate({
      outputMp4Path: params.outputPath,
      spec: params.spec,
      events: inputs?.events,
      narrationSegments: inputs?.narrationSegments,
      ...(params.screenshotData ?? {}),
    });
    logNonPassingResults(gate);
    const reportPath = await writeQualityReport({
      outputDir: params.outputDir,
      outputPath: params.outputPath,
      gate,
    });
    await updateVerificationQuality({
      verificationPath: params.verificationPath,
      qualityReportPath: reportPath,
      status: qualityStatus(gate),
    });
    const status = qualityStatus(gate);
    throwIfQualityFailed(gate);
    logQualitySummary(gate);
    return { status, ...(reportPath ? { qualityReportPath: reportPath } : {}) };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Quality gate failed:")) throw err;
    const reportPath = await writeQualityErrorReport({
      outputDir: params.outputDir,
      outputPath: params.outputPath,
      error: err,
    });
    await updateVerificationQuality({
      verificationPath: params.verificationPath,
      qualityReportPath: reportPath,
      status: "fail",
    });
    throw new Error(
      `Quality gate failed to run: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}
