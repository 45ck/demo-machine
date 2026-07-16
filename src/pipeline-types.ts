export interface PipelineArtifacts {
  tracePath?: string | undefined;
  eventLogPath: string;
  metadataPath?: string | undefined;
  environmentPath: string;
  verificationPath: string;
  screenshotManifestPath?: string | undefined;
}

export interface RunResult {
  title: string;
  outputDir: string;
  videoPath: string;
  eventCount: number;
  artifacts?: PipelineArtifacts | undefined;
  renderedVideoPath?: string | undefined;
  qualityReportPath?: string | undefined;
  qualityStatus?: "pass" | "warn" | "fail" | undefined;
  shareViewerPath?: string | undefined;
  shareManifestPath?: string | undefined;
}
