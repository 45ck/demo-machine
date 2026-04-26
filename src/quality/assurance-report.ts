type VisualAssuranceStatus = "pass" | "warn" | "fail";

type VisualAssuranceSeverity = "warn" | "fail";

interface VisualAssuranceEventSummary {
  action: string;
  selector: string | null;
}

interface VisualAssurancePaths {
  screenshot: string | null;
  diff: string | null;
}

interface VisualAssuranceSample {
  demoSlug: string;
  stepIndex: number;
  timestampMs: number;
  reason: string;
  severity: VisualAssuranceSeverity;
  paths: VisualAssurancePaths;
  event: VisualAssuranceEventSummary;
  suggestedFix: string | null;
}

interface VisualAssuranceSampleInput {
  demoSlug: string;
  stepIndex: number;
  timestampMs: number;
  reason: string;
  severity: VisualAssuranceSeverity;
  screenshotPath?: string | null | undefined;
  diffPath?: string | null | undefined;
  event?:
    | {
        action: string;
        selector?: string | null | undefined;
      }
    | undefined;
  suggestedFix?: string | null | undefined;
}

interface VisualAssuranceSummary {
  pass: number;
  warn: number;
  fail: number;
  total: number;
}

interface VisualAssuranceReport {
  schemaVersion: 1;
  createdAt: string;
  status: VisualAssuranceStatus;
  summary: VisualAssuranceSummary;
  samples: VisualAssuranceSample[];
}

const DEFAULT_EVENT: VisualAssuranceEventSummary = {
  action: "unknown",
  selector: null,
};

const SEVERITY_ORDER: Record<VisualAssuranceSeverity, number> = {
  fail: 0,
  warn: 1,
};

export function buildVisualAssuranceSample(
  input: VisualAssuranceSampleInput,
): VisualAssuranceSample {
  return {
    demoSlug: input.demoSlug,
    stepIndex: input.stepIndex,
    timestampMs: input.timestampMs,
    reason: input.reason,
    severity: input.severity,
    paths: {
      screenshot: input.screenshotPath ?? null,
      diff: input.diffPath ?? null,
    },
    event: input.event
      ? {
          action: input.event.action,
          selector: input.event.selector ?? null,
        }
      : DEFAULT_EVENT,
    suggestedFix: input.suggestedFix ?? null,
  };
}

export function aggregateVisualAssuranceStatus(
  samples: readonly Pick<VisualAssuranceSample, "severity">[],
): VisualAssuranceStatus {
  let hasWarn = false;

  for (const sample of samples) {
    if (sample.severity === "fail") {
      return "fail";
    }
    hasWarn = true;
  }

  return hasWarn ? "warn" : "pass";
}

export function summarizeVisualAssuranceSamples(
  samples: readonly Pick<VisualAssuranceSample, "severity">[],
): VisualAssuranceSummary {
  const summary: VisualAssuranceSummary = {
    pass: 0,
    warn: 0,
    fail: 0,
    total: samples.length,
  };

  if (samples.length === 0) {
    summary.pass = 1;
    return summary;
  }

  for (const sample of samples) {
    summary[sample.severity] += 1;
  }

  return summary;
}

export function buildVisualAssuranceReport(params: {
  samples?: readonly VisualAssuranceSampleInput[] | undefined;
  createdAt?: string | Date | undefined;
}): VisualAssuranceReport {
  const samples = [...(params.samples ?? [])]
    .map(buildVisualAssuranceSample)
    .sort(compareVisualAssuranceSamples);

  return {
    schemaVersion: 1,
    createdAt: normalizeCreatedAt(params.createdAt),
    status: aggregateVisualAssuranceStatus(samples),
    summary: summarizeVisualAssuranceSamples(samples),
    samples,
  };
}

function normalizeCreatedAt(createdAt: string | Date | undefined): string {
  if (createdAt instanceof Date) {
    return createdAt.toISOString();
  }
  return createdAt ?? new Date().toISOString();
}

function compareVisualAssuranceSamples(
  left: VisualAssuranceSample,
  right: VisualAssuranceSample,
): number {
  return (
    left.demoSlug.localeCompare(right.demoSlug) ||
    left.stepIndex - right.stepIndex ||
    left.timestampMs - right.timestampMs ||
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
    left.reason.localeCompare(right.reason)
  );
}
