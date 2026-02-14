export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActionEvent {
  action: string;
  selector?: string;
  timestamp: number;
  boundingBox?: BoundingBox;
  duration: number;
  narration?: string;
}

export interface PlaybackResult {
  events: ActionEvent[];
  durationMs: number;
}

export interface Pacing {
  cursorDurationMs: number;
  typeDelayMs: number;
  postClickDelayMs: number;
  postTypeDelayMs: number;
  postNavigateDelayMs: number;
  settleDelayMs: number;
}

export interface PlaybackOptions {
  baseUrl: string;
  redactionSelectors?: string[] | undefined;
  secretPatterns?: string[] | undefined;
  pacing?: Pacing | undefined;
}
