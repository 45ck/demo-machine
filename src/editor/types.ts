export type SegmentType = "intro" | "chapter" | "content" | "callout" | "zoom" | "outro";

export interface Segment {
  startMs: number;
  endMs: number;
  type: SegmentType;
  label?: string;
  zoom?: ZoomRegion;
  speedFactor?: number;
}

export interface ZoomRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;
}

export interface Timeline {
  segments: Segment[];
  totalDurationMs: number;
  resolution: { width: number; height: number };
}

export interface RenderOptions {
  outputPath: string;
  videoPath: string;
  audioPath?: string | undefined;
  resolution?: { width: number; height: number } | undefined;
  branding?:
    | {
        logo?: string | undefined;
        colors?: { primary: string; background: string } | undefined;
      }
    | undefined;
}

export interface VideoRenderer {
  name: string;
  render(timeline: Timeline, options: RenderOptions): Promise<string>;
}
