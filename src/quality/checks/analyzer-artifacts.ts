import type { CheckResult } from "../../validation/types.js";
import { postRenderFail, postRenderPass, postRenderWarn } from "../../validation/types.js";
import type { AnalyzerArtifactPayload, QualityCheckContext } from "../types.js";

type JsonRecord = Record<string, unknown>;

const LAYOUT_ARTIFACT = "layout-safety.report.json";
const SEGMENT_ARTIFACT = "segment.evidence.json";
const REVIEW_ARTIFACT = "review-bundle.json";
const LAYOUT_CHECK = "analyzer:layout-safety";
const SEGMENT_CHECK = "analyzer:segment-evidence";
const REVIEW_CHECK = "analyzer:review-bundle";
const FAIL_STATUSES = new Set(["fail", "error", "reject"]);
const WARN_STATUSES = new Set(["warn", "warning", "weak", "empty"]);
const PASS_STATUSES = new Set(["pass", "usable", "present"]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function numberValue(record: JsonRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function recordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function malformed(artifact: string, payload: AnalyzerArtifactPayload): CheckResult {
  return postRenderWarn(
    `analyzer:${artifact}`,
    `${artifact} is present but could not be evaluated: ${payload.error ?? "invalid JSON shape"}`,
  );
}

function statusImpact(status: string): "fail" | "warn" | "pass" | "unknown" {
  if (FAIL_STATUSES.has(status)) return "fail";
  if (WARN_STATUSES.has(status)) return "warn";
  if (PASS_STATUSES.has(status)) return "pass";
  return "unknown";
}

function countStatuses(statuses: string[]): {
  failures: number;
  warnings: number;
  unknown: number;
} {
  let failures = 0;
  let warnings = 0;
  let unknown = 0;

  for (const status of statuses) {
    const impact = statusImpact(status);
    if (impact === "fail") {
      failures += 1;
    } else if (impact === "warn") {
      warnings += 1;
    } else if (impact === "unknown") {
      unknown += 1;
    }
  }

  return { failures, warnings, unknown };
}

function checkLayoutSafety(payload: AnalyzerArtifactPayload): CheckResult {
  if (payload.error) return malformed("layout-safety", payload);
  if (!isRecord(payload.data)) return malformed("layout-safety", payload);

  const issues = recordArray(payload.data["issues"]);
  if (!Array.isArray(payload.data["issues"])) {
    return postRenderWarn(LAYOUT_CHECK, `${LAYOUT_ARTIFACT} is present but has no issues array`);
  }

  const errorCount = issues.filter((issue) => stringValue(issue, "severity") === "error").length;
  const warningCount = issues.filter(
    (issue) => stringValue(issue, "severity") === "warning",
  ).length;

  if (errorCount > 0) {
    return postRenderFail(
      LAYOUT_CHECK,
      `${errorCount} layout safety error(s) reported`,
      "Fix overlapping or unsafe layout elements before publishing the demo",
    );
  }
  if (warningCount > 0) {
    return postRenderWarn(LAYOUT_CHECK, `${warningCount} layout safety warning(s) reported`);
  }
  return postRenderPass(LAYOUT_CHECK);
}

function segmentSummaryValue(
  summary: JsonRecord | undefined,
  key: string,
  fallback: number,
): number {
  return summary ? (numberValue(summary, key) ?? fallback) : fallback;
}

function segmentEvidenceStats(record: JsonRecord): {
  hasSegmentsArray: boolean;
  segmentCount: number;
  emptySegments: number;
  weakSegments: number;
  failures: number;
  warnings: number;
  unknown: number;
} {
  const hasSegmentsArray = Array.isArray(record["segments"]);
  const segments = recordArray(record["segments"]);
  const summary = isRecord(record["summary"]) ? record["summary"] : undefined;
  const statuses = segments
    .map((segment) => stringValue(segment, "evidenceStatus"))
    .filter((status): status is string => status !== undefined);
  const statusCounts = countStatuses(statuses);
  const emptyBySegment = segments.filter(
    (segment) => stringValue(segment, "evidenceStatus") === "empty",
  ).length;
  const weakBySegment = segments.filter(
    (segment) => stringValue(segment, "evidenceStatus") === "weak",
  ).length;

  return {
    hasSegmentsArray,
    segmentCount: segmentSummaryValue(summary, "segmentCount", segments.length),
    emptySegments: segmentSummaryValue(summary, "emptySegments", emptyBySegment),
    weakSegments: segmentSummaryValue(summary, "weakSegments", weakBySegment),
    failures: statusCounts.failures,
    warnings: statusCounts.warnings,
    unknown: statusCounts.unknown,
  };
}

function checkSegmentEvidence(payload: AnalyzerArtifactPayload): CheckResult {
  if (payload.error) return malformed("segment-evidence", payload);
  if (!isRecord(payload.data)) return malformed("segment-evidence", payload);

  const stats = segmentEvidenceStats(payload.data);
  if (!stats.hasSegmentsArray) {
    return postRenderWarn(
      SEGMENT_CHECK,
      `${SEGMENT_ARTIFACT} is present but has no segments array`,
    );
  }
  if (stats.segmentCount === 0) {
    return postRenderWarn(SEGMENT_CHECK, `${SEGMENT_ARTIFACT} contains no analyzable segments`);
  }
  if (stats.failures > 0) {
    return postRenderFail(
      SEGMENT_CHECK,
      `${stats.failures} segment(s) have rejected evidence`,
      `Inspect ${SEGMENT_ARTIFACT} and regenerate storyboard/evidence artifacts for rejected segments`,
    );
  }
  if (stats.emptySegments > 0 || stats.weakSegments > 0 || stats.warnings > 0) {
    return postRenderWarn(
      SEGMENT_CHECK,
      `${Math.max(stats.emptySegments, stats.weakSegments, stats.warnings)} segment(s) have weak or empty evidence`,
    );
  }
  if (stats.unknown > 0) {
    return postRenderWarn(
      SEGMENT_CHECK,
      `${stats.unknown} segment(s) have unknown evidence status`,
    );
  }
  return postRenderPass(SEGMENT_CHECK);
}

function unwrapReviewBundle(data: unknown): JsonRecord | undefined {
  if (!isRecord(data)) return undefined;
  return isRecord(data["bundle"]) ? data["bundle"] : data;
}

function checkReviewBundle(payload: AnalyzerArtifactPayload): CheckResult {
  if (payload.error) return malformed("review-bundle", payload);

  const bundle = unwrapReviewBundle(payload.data);
  if (!bundle) return malformed("review-bundle", payload);

  const statuses = recordArray(bundle["reportStatuses"])
    .map((entry) => stringValue(entry, "status"))
    .filter((status): status is string => status !== undefined);
  const overallStatus = stringValue(bundle, "overallStatus");
  const counts = countStatuses([...(overallStatus ? [overallStatus] : []), ...statuses]);

  if (counts.failures > 0) {
    return postRenderFail(
      REVIEW_CHECK,
      `${REVIEW_ARTIFACT} reports failing analyzer status`,
      `Open ${REVIEW_ARTIFACT} and fix the failing analyzer report before publishing`,
    );
  }
  if (counts.warnings > 0) {
    return postRenderWarn(REVIEW_CHECK, `${REVIEW_ARTIFACT} reports warnings`);
  }
  if (overallStatus === "unknown" || (!overallStatus && statuses.length === 0)) {
    return postRenderWarn(
      REVIEW_CHECK,
      `${REVIEW_ARTIFACT} does not contain a conclusive analyzer status`,
    );
  }
  return postRenderPass(REVIEW_CHECK);
}

export function checkAnalyzerArtifacts(ctx: QualityCheckContext): CheckResult[] {
  const artifacts = ctx.analyzerArtifacts;
  if (!artifacts) return [];

  const results: CheckResult[] = [];
  const layoutSafety = artifacts[LAYOUT_ARTIFACT];
  const segmentEvidence = artifacts[SEGMENT_ARTIFACT];
  const reviewBundle = artifacts[REVIEW_ARTIFACT];

  if (layoutSafety) results.push(checkLayoutSafety(layoutSafety));
  if (segmentEvidence) results.push(checkSegmentEvidence(segmentEvidence));
  if (reviewBundle) results.push(checkReviewBundle(reviewBundle));

  return results;
}
