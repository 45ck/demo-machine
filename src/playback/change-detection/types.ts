import type { PlaywrightPage } from "../playwright.js";
import type { Step } from "../../spec/types.js";

export type { ChangeDetectionMode, ChangeDetectionConfig } from "./config.js";
export { DEFAULT_CHANGE_DETECTION_CONFIG, isInteractiveAction } from "./config.js";

export interface DetectorSignal {
  /** Which detector produced this signal. */
  detector: string;
  /** Did this detector observe a change? */
  changesDetected: boolean;
  /** 0–1 confidence (e.g. 3 mutations = high, 1 scroll pixel = low). */
  confidence: number;
  /** Human-readable summary, e.g. "12 DOM mutations (3 childList, 9 attribute)". */
  details: string;
}

export interface ChangeDetector {
  readonly name: string;
  /** One-time initialization (optional). */
  setup?(page: PlaywrightPage): Promise<void>;
  /** Capture pre-action state. */
  before(page: PlaywrightPage, step: Step): Promise<void>;
  /** Capture post-action state and produce a signal. */
  after(page: PlaywrightPage, step: Step): Promise<DetectorSignal>;
}
