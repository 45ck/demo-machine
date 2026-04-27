export interface DemoCompositionProps {
  specTitle: string;
  videoSrc: string;
  audioSrc?: string;
  videoStartMs?: number;
  durationMs?: number;
  resolution: { width: number; height: number };
  fps: number;
}
