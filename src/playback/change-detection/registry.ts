import type { ChangeDetector, ChangeDetectionConfig } from "./types.js";
import { DomMutationDetector } from "./dom-mutation.js";
import { LayoutDetector } from "./layout.js";
import { ComputedStyleDetector } from "./computed-style.js";
import { ScreenshotDiffDetector } from "./screenshot-diff.js";

type DetectorFactory = (config: ChangeDetectionConfig) => ChangeDetector;

const BUILTIN_DETECTORS: Record<string, DetectorFactory> = {
  "dom-mutation": () => new DomMutationDetector(),
  layout: () => new LayoutDetector(),
  "computed-style": () => new ComputedStyleDetector(),
  "screenshot-diff": (cfg) => new ScreenshotDiffDetector(cfg.screenshotThreshold),
};

/**
 * Instantiate detectors by name.  Unknown names are silently ignored (the
 * orchestrator logs a warning).
 */
export function createDetectors(config: ChangeDetectionConfig): ChangeDetector[] {
  const detectors: ChangeDetector[] = [];
  for (const name of config.detectors) {
    const factory = BUILTIN_DETECTORS[name];
    if (factory) {
      detectors.push(factory(config));
    }
  }
  return detectors;
}

export function isKnownDetector(name: string): boolean {
  return name in BUILTIN_DETECTORS;
}

export const KNOWN_DETECTOR_NAMES = Object.keys(BUILTIN_DETECTORS);
