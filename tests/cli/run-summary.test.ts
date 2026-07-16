import { describe, expect, it } from "vitest";
import { formatCaptureSummary, formatRunSummary } from "../../src/cli/run-summary.js";

describe("run summaries", () => {
  it("formats capture artifacts into a scannable summary", () => {
    const summary = formatCaptureSummary({
      title: "Checkout",
      outputDir: "C:\\demo\\output\\checkout\\run",
      videoPath: "C:\\demo\\output\\checkout\\run\\video.webm",
      eventCount: 3,
      artifacts: {
        eventLogPath: "C:\\demo\\output\\checkout\\run\\events.json",
        tracePath: "C:\\demo\\output\\checkout\\run\\trace.zip",
        verificationPath: "C:\\demo\\output\\checkout\\run\\verification.json",
      },
    });

    expect(summary).toContain("Capture summary");
    expect(summary).toContain("- Event count: 3");
    expect(summary).toContain("verification.json");
  });

  it("formats rendered output and quality evidence", () => {
    const summary = formatRunSummary({
      title: "Checkout",
      outputDir: "C:\\demo\\output\\checkout\\run",
      videoPath: "C:\\demo\\output\\checkout\\run\\video.webm",
      renderedVideoPath: "C:\\demo\\output\\checkout\\run\\output.mp4",
      qualityReportPath: "C:\\demo\\output\\checkout\\run\\quality.json",
      qualityStatus: "pass",
      shareViewerPath: "C:\\demo\\output\\checkout\\run\\viewer.html",
      shareManifestPath: "C:\\demo\\output\\checkout\\run\\viewer.manifest.json",
      eventCount: 3,
    });

    expect(summary).toContain("- Rendered video: C:\\demo\\output\\checkout\\run\\output.mp4");
    expect(summary).toContain("- Quality report: C:\\demo\\output\\checkout\\run\\quality.json");
    expect(summary).toContain("- Quality status: pass");
    expect(summary).toContain("- Share viewer: C:\\demo\\output\\checkout\\run\\viewer.html");
    expect(summary).toContain("viewer.manifest.json");
  });
});
