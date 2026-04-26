import { describe, expect, it } from "vitest";
import {
  aggregateVisualAssuranceStatus,
  buildVisualAssuranceReport,
  buildVisualAssuranceSample,
  summarizeVisualAssuranceSamples,
} from "../../src/quality/assurance-report.js";

describe("visual assurance report", () => {
  it("builds JSON-safe samples with paths, event details, and suggested fixes", () => {
    const sample = buildVisualAssuranceSample({
      demoSlug: "todo-app",
      stepIndex: 2,
      timestampMs: 1250,
      reason: "Button shifted 16px from golden frame",
      severity: "fail",
      screenshotPath: "output/todo-app/step-02.png",
      diffPath: "output/todo-app/step-02.diff.png",
      event: { action: "click", selector: "[data-testid='save']" },
      suggestedFix: "Pin the toolbar layout before capturing the click.",
    });

    expect(sample).toEqual({
      demoSlug: "todo-app",
      stepIndex: 2,
      timestampMs: 1250,
      reason: "Button shifted 16px from golden frame",
      severity: "fail",
      paths: {
        screenshot: "output/todo-app/step-02.png",
        diff: "output/todo-app/step-02.diff.png",
      },
      event: {
        action: "click",
        selector: "[data-testid='save']",
      },
      suggestedFix: "Pin the toolbar layout before capturing the click.",
    });
  });

  it("uses stable status aggregation for pass, warn, and fail", () => {
    expect(aggregateVisualAssuranceStatus([])).toBe("pass");
    expect(aggregateVisualAssuranceStatus([{ severity: "warn" }])).toBe("warn");
    expect(aggregateVisualAssuranceStatus([{ severity: "warn" }, { severity: "fail" }])).toBe(
      "fail",
    );
  });

  it("summarizes sample severities with a pass marker for empty reports", () => {
    expect(summarizeVisualAssuranceSamples([])).toEqual({
      pass: 1,
      warn: 0,
      fail: 0,
      total: 0,
    });
    expect(
      summarizeVisualAssuranceSamples([
        { severity: "warn" },
        { severity: "fail" },
        { severity: "fail" },
      ]),
    ).toEqual({
      pass: 0,
      warn: 1,
      fail: 2,
      total: 3,
    });
  });

  it("builds a deterministic report ordered by demo, step, timestamp, and severity", () => {
    const report = buildVisualAssuranceReport({
      createdAt: new Date("2026-04-26T00:00:00.000Z"),
      samples: [
        {
          demoSlug: "virtual-table",
          stepIndex: 1,
          timestampMs: 500,
          reason: "Unexpected row highlight",
          severity: "warn",
          event: { action: "hover" },
        },
        {
          demoSlug: "todo-app",
          stepIndex: 3,
          timestampMs: 1500,
          reason: "Diff exceeded threshold",
          severity: "fail",
          screenshotPath: "screens/todo-3.png",
          diffPath: "diffs/todo-3.png",
          event: { action: "click", selector: "#complete" },
          suggestedFix: "Update the fixture data or refresh the golden frame.",
        },
        {
          demoSlug: "todo-app",
          stepIndex: 2,
          timestampMs: 1000,
          reason: "Missing cursor",
          severity: "warn",
        },
      ],
    });

    expect(report).toEqual({
      schemaVersion: 1,
      createdAt: "2026-04-26T00:00:00.000Z",
      status: "fail",
      summary: {
        pass: 0,
        warn: 2,
        fail: 1,
        total: 3,
      },
      samples: [
        {
          demoSlug: "todo-app",
          stepIndex: 2,
          timestampMs: 1000,
          reason: "Missing cursor",
          severity: "warn",
          paths: {
            screenshot: null,
            diff: null,
          },
          event: {
            action: "unknown",
            selector: null,
          },
          suggestedFix: null,
        },
        {
          demoSlug: "todo-app",
          stepIndex: 3,
          timestampMs: 1500,
          reason: "Diff exceeded threshold",
          severity: "fail",
          paths: {
            screenshot: "screens/todo-3.png",
            diff: "diffs/todo-3.png",
          },
          event: {
            action: "click",
            selector: "#complete",
          },
          suggestedFix: "Update the fixture data or refresh the golden frame.",
        },
        {
          demoSlug: "virtual-table",
          stepIndex: 1,
          timestampMs: 500,
          reason: "Unexpected row highlight",
          severity: "warn",
          paths: {
            screenshot: null,
            diff: null,
          },
          event: {
            action: "hover",
            selector: null,
          },
          suggestedFix: null,
        },
      ],
    });
  });

  it("orders failures before warnings for the same demo, step, and timestamp", () => {
    const report = buildVisualAssuranceReport({
      createdAt: "2026-04-26T00:00:00.000Z",
      samples: [
        {
          demoSlug: "todo-app",
          stepIndex: 2,
          timestampMs: 1000,
          reason: "Small diff",
          severity: "warn",
        },
        {
          demoSlug: "todo-app",
          stepIndex: 2,
          timestampMs: 1000,
          reason: "Large diff",
          severity: "fail",
        },
      ],
    });

    expect(report.samples.map((sample) => sample.severity)).toEqual(["fail", "warn"]);
    expect(report.samples.map((sample) => sample.reason)).toEqual(["Large diff", "Small diff"]);
  });
});
