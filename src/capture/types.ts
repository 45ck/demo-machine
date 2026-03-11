export type { ActionEvent } from "../playback/types.js";

export interface CaptureOptions {
  outputDir: string;
  resolution: { width: number; height: number };
  strictGeometry?: boolean | undefined;
}

export interface CaptureGeometrySnapshot {
  innerWidth: number;
  innerHeight: number;
  outerWidth: number;
  outerHeight: number;
  availWidth: number;
  availHeight: number;
  devicePixelRatio: number;
}

export interface CaptureBundle {
  videoPath: string;
  tracePath: string;
  eventLogPath: string;
  metadataPath?: string;
  environmentPath?: string;
  verificationPath?: string;
  screenshots: string[];
}
