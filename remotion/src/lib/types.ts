export interface DemoCompositionProps {
  specTitle: string;
  videoSrc: string;
  audioSrc?: string;
  resolution: { width: number; height: number };
  fps: number;
}
