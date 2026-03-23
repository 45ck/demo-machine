export type ChangeDetectionMode = "error" | "warn" | "off";

export interface ChangeDetectionConfig {
  mode: ChangeDetectionMode;
  detectors: string[];
  /** Time (ms) to wait for async DOM mutations after action + settle. */
  mutationWaitMs: number;
  /** Pixel diff ratio threshold for the screenshot-diff detector. */
  screenshotThreshold: number;
}

export const DEFAULT_CHANGE_DETECTION_CONFIG: ChangeDetectionConfig = {
  mode: "error",
  detectors: ["dom-mutation", "layout", "computed-style", "aria-state"],
  mutationWaitMs: 100,
  screenshotThreshold: 0.001,
};

/** Actions whose visual effect should be validated. */
const INTERACTIVE_ACTIONS = new Set([
  "click",
  "clickFirstVisible",
  "type",
  "select",
  "selectFirstNonPlaceholder",
  "check",
  "uncheck",
  "upload",
  "dragAndDrop",
  "hover",
  "scroll",
]);

export function isInteractiveAction(action: string): boolean {
  return INTERACTIVE_ACTIONS.has(action);
}
