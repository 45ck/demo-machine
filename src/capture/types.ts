export type { ActionEvent } from "../playback/types.js";

export interface CaptureOptions {
  outputDir: string;
  resolution: { width: number; height: number };
  strictGeometry?: boolean | undefined;
}

export interface CaptureBundle {
  videoPath: string;
  tracePath: string;
  eventLogPath: string;
  metadataPath?: string;
  screenshots: string[];
}
