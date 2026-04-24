interface ArtifactSummary {
  tracePath?: string | undefined;
  eventLogPath?: string | undefined;
  metadataPath?: string | undefined;
  environmentPath?: string | undefined;
  verificationPath?: string | undefined;
  screenshotManifestPath?: string | undefined;
}

interface CaptureSummaryInput {
  title: string;
  outputDir: string;
  videoPath: string;
  eventCount: number;
  artifacts?: ArtifactSummary | undefined;
}

interface RunSummaryInput extends CaptureSummaryInput {
  renderedVideoPath?: string | undefined;
  qualityReportPath?: string | undefined;
  qualityStatus?: "pass" | "warn" | "fail" | undefined;
}

function addArtifactLines(lines: string[], artifacts: ArtifactSummary | undefined): void {
  if (!artifacts) return;
  if (artifacts.eventLogPath) lines.push(`- Events: ${artifacts.eventLogPath}`);
  if (artifacts.tracePath) lines.push(`- Trace: ${artifacts.tracePath}`);
  if (artifacts.environmentPath) lines.push(`- Environment: ${artifacts.environmentPath}`);
  if (artifacts.verificationPath) lines.push(`- Verification: ${artifacts.verificationPath}`);
  if (artifacts.screenshotManifestPath)
    lines.push(`- Screenshots: ${artifacts.screenshotManifestPath}`);
  if (artifacts.metadataPath) lines.push(`- Metadata: ${artifacts.metadataPath}`);
}

export function formatCaptureSummary(input: CaptureSummaryInput): string {
  const lines = [
    "Capture summary",
    `- Title: ${input.title}`,
    `- Output dir: ${input.outputDir}`,
    `- Raw video: ${input.videoPath}`,
    `- Event count: ${String(input.eventCount)}`,
  ];
  addArtifactLines(lines, input.artifacts);
  return lines.join("\n");
}

export function formatRunSummary(input: RunSummaryInput): string {
  const lines = [
    "Run summary",
    `- Title: ${input.title}`,
    `- Output dir: ${input.outputDir}`,
    `- Raw video: ${input.videoPath}`,
  ];
  if (input.renderedVideoPath) lines.push(`- Rendered video: ${input.renderedVideoPath}`);
  lines.push(`- Event count: ${String(input.eventCount)}`);
  addArtifactLines(lines, input.artifacts);
  if (input.qualityReportPath) lines.push(`- Quality report: ${input.qualityReportPath}`);
  if (input.qualityStatus) lines.push(`- Quality status: ${input.qualityStatus}`);
  return lines.join("\n");
}
