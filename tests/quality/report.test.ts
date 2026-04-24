import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildQualityGateErrorReport,
  buildQualityGateReport,
  writeQualityGateReport,
} from "../../src/quality/report.js";
import type { QualityGateResult } from "../../src/quality/runner.js";

function gate(): QualityGateResult {
  return {
    durationMs: 12,
    hasFailures: true,
    results: [
      { phase: "post-render", checkName: "a", status: "pass", message: "OK" },
      { phase: "post-render", checkName: "b", status: "warn", message: "warning" },
      { phase: "post-render", checkName: "c", status: "fail", message: "failure" },
    ],
  };
}

describe("quality report", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "quality-report-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("builds summary counts from quality results", () => {
    const report = buildQualityGateReport({ outputPath: "output.mp4", gate: gate() });

    expect(report.schemaVersion).toBe(1);
    expect(report.status).toBe("fail");
    expect(report.outputPath).toBe("output.mp4");
    expect(report.summary).toEqual({ pass: 1, warn: 1, fail: 1, total: 3 });
    expect(report.hasFailures).toBe(true);
  });

  it("builds an error report when the quality gate cannot run", () => {
    const report = buildQualityGateErrorReport({
      outputPath: "output.mp4",
      error: new Error("ffprobe missing"),
    });

    expect(report.status).toBe("fail");
    expect(report.hasFailures).toBe(true);
    expect(report.summary).toEqual({ pass: 0, warn: 0, fail: 1, total: 1 });
    expect(report.error?.message).toBe("ffprobe missing");
  });

  it("writes quality.json to the output directory", async () => {
    const reportPath = await writeQualityGateReport({
      outputDir: tempDir,
      outputPath: "output.mp4",
      gate: gate(),
    });

    expect(reportPath).toBe(join(tempDir, "quality.json"));
    const parsed = JSON.parse(await readFile(reportPath, "utf8")) as {
      summary: Record<string, number>;
      results: unknown[];
    };
    expect(parsed.summary["fail"]).toBe(1);
    expect(parsed.results).toHaveLength(3);
  });
});
