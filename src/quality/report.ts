import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CheckResult, CheckSeverity } from "../validation/types.js";
import type { QualityGateResult } from "./runner.js";

interface QualityGateReport {
  schemaVersion: 1;
  createdAt: string;
  status: "pass" | "warn" | "fail";
  outputPath: string;
  durationMs: number;
  hasFailures: boolean;
  summary: Record<CheckSeverity, number> & { total: number };
  results: CheckResult[];
  error?: { message: string } | undefined;
}

export function buildQualityGateReport(params: {
  outputPath: string;
  gate: QualityGateResult;
}): QualityGateReport {
  const summary = {
    pass: 0,
    warn: 0,
    fail: 0,
    total: params.gate.results.length,
  };

  for (const result of params.gate.results) {
    summary[result.status] += 1;
  }
  const status = summary.fail > 0 ? "fail" : summary.warn > 0 ? "warn" : "pass";

  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    status,
    outputPath: params.outputPath,
    durationMs: params.gate.durationMs,
    hasFailures: params.gate.hasFailures,
    summary,
    results: params.gate.results,
  };
}

export function buildQualityGateErrorReport(params: {
  outputPath: string;
  error: unknown;
}): QualityGateReport {
  const message = params.error instanceof Error ? params.error.message : String(params.error);
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    status: "fail",
    outputPath: params.outputPath,
    durationMs: 0,
    hasFailures: true,
    summary: {
      pass: 0,
      warn: 0,
      fail: 1,
      total: 1,
    },
    results: [],
    error: { message },
  };
}

export async function writeQualityGateReport(params: {
  outputDir: string;
  outputPath: string;
  gate: QualityGateResult;
}): Promise<string> {
  const reportPath = join(params.outputDir, "quality.json");
  const report = buildQualityGateReport({
    outputPath: params.outputPath,
    gate: params.gate,
  });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf-8");
  return reportPath;
}

export async function writeQualityGateErrorReport(params: {
  outputDir: string;
  outputPath: string;
  error: unknown;
}): Promise<string> {
  const reportPath = join(params.outputDir, "quality.json");
  const report = buildQualityGateErrorReport({
    outputPath: params.outputPath,
    error: params.error,
  });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf-8");
  return reportPath;
}
