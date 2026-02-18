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
  /** Timestamp (ms since epoch) at the start of playback execution (time base for events). */
  startTimestamp: number;
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
  /** Directory of the spec file (used to resolve relative assets like upload paths). */
  specDir?: string | undefined;
  redactionSelectors?: string[] | undefined;
  secretPatterns?: string[] | undefined;
  pacing?: Pacing | undefined;
  onStepComplete?: ((event: ActionEvent) => Promise<void>) | undefined;
  narration?:
    | {
        mode: import("../utils/narration-sync-types.js").NarrationSyncMode;
        bufferMs: number;
        timing: import("../utils/narration-sync-types.js").NarrationTimingMap;
      }
    | undefined;
}
