import type { PlaywrightPage } from "../playwright.js";
import type { Step } from "../../spec/types.js";
import type { ChangeDetector, ChangeDetectionConfig, DetectorSignal } from "./types.js";
import { isInteractiveAction } from "./types.js";
import { createDetectors, isKnownDetector } from "./registry.js";
import { NoVisibleChangeError } from "../errors.js";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("change-detection");

export class ChangeDetectionOrchestrator {
  private readonly config: ChangeDetectionConfig;
  private readonly detectors: ChangeDetector[];
  private armed = false;

  constructor(config: ChangeDetectionConfig) {
    this.config = config;
    this.detectors = createDetectors(config);

    // Warn about unknown detector names.
    for (const name of config.detectors) {
      if (!isKnownDetector(name)) {
        logger.warn(`Unknown change detector: "${name}" — skipped`);
      }
    }
  }

  /** One-time setup — called once per playback run. */
  async setup(page: PlaywrightPage): Promise<void> {
    for (const d of this.detectors) {
      if (d.setup) await d.setup(page);
    }
  }

  /** Should change detection run for this step? */
  shouldCheck(step: Step): boolean {
    if (this.config.mode === "off") return false;
    // Per-step opt-out.
    if (
      "expectVisualChange" in step &&
      (step as { expectVisualChange?: boolean }).expectVisualChange === false
    ) {
      return false;
    }
    return isInteractiveAction(step.action);
  }

  /** Capture pre-action state across all detectors. */
  async before(page: PlaywrightPage, step: Step): Promise<void> {
    this.armed = true;
    await Promise.all(this.detectors.map((d) => d.before(page, step)));
  }

  /**
   * Capture post-action state, aggregate signals, and enforce the configured
   * mode (error / warn).
   */
  async after(params: {
    page: PlaywrightPage;
    step: Step;
    stepIndex: number;
    chapterTitle: string;
  }): Promise<DetectorSignal[]> {
    if (!this.armed) return [];
    this.armed = false;

    // Wait for async mutations to land.
    if (this.config.mutationWaitMs > 0) {
      await params.page.waitForTimeout(this.config.mutationWaitMs);
    }

    const signals = await Promise.all(this.detectors.map((d) => d.after(params.page, params.step)));

    const anyChange = signals.some((s) => s.changesDetected);

    if (!anyChange) {
      const summaryParts = signals.map((s) => `[${s.detector}] ${s.details}`);
      const message =
        `No visible change detected at step ${String(params.stepIndex)} ` +
        `(${params.chapterTitle}): ${params.step.action}\n` +
        summaryParts.join("\n");

      if (this.config.mode === "error") {
        throw new NoVisibleChangeError({
          stepIndex: params.stepIndex,
          chapterTitle: params.chapterTitle,
          step: params.step,
          signals,
        });
      }

      if (this.config.mode === "warn") {
        logger.warn(message);
      }
    } else {
      const detected = signals.filter((s) => s.changesDetected);
      logger.debug(
        `Change detected at step ${String(params.stepIndex)}: ` +
          detected.map((s) => `[${s.detector}] ${s.details}`).join("; "),
      );
    }

    return signals;
  }
}
