import type { PlaywrightPage } from "./playwright.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("screenshot-collector");

export interface ScreenshotCollectorResults {
  stepScreenshots: Map<number, Buffer>;
  assertScreenshotPairs: Array<{ stepIndex: number; before: Buffer; after: Buffer }>;
  cursorPositions: Array<{
    stepIndex: number;
    cursorX: number;
    cursorY: number;
    targetCenterX: number;
    targetCenterY: number;
  }>;
  chapterTitleScreenshots: Map<number, Buffer>;
}

/**
 * Collects screenshots during playback for Phase 4 visual regression checks.
 * Built by another team — this is the interface contract.
 */
export class ScreenshotCollector {
  private readonly stepScreenshots = new Map<number, Buffer>();
  private readonly pendingBeforeBuffers = new Map<number, Buffer>();
  private readonly assertPairs: ScreenshotCollectorResults["assertScreenshotPairs"] = [];
  private readonly cursors: ScreenshotCollectorResults["cursorPositions"] = [];
  private readonly chapterScreenshots = new Map<number, Buffer>();

  async captureStep(stepIndex: number, page: PlaywrightPage): Promise<void> {
    try {
      const buf = await page.screenshot();
      this.stepScreenshots.set(stepIndex, buf);
    } catch (err) {
      log.warn(
        `Failed to capture step screenshot for step ${String(stepIndex)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async captureBeforeAssert(stepIndex: number, page: PlaywrightPage): Promise<void> {
    try {
      const buf = await page.screenshot();
      this.pendingBeforeBuffers.set(stepIndex, buf);
    } catch (err) {
      log.warn(
        `Failed to capture before-assert screenshot for step ${String(stepIndex)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async captureAfterAssert(stepIndex: number, page: PlaywrightPage): Promise<void> {
    try {
      const buf = await page.screenshot();
      const beforeBuf = this.pendingBeforeBuffers.get(stepIndex);
      if (beforeBuf) {
        this.assertPairs.push({ stepIndex, before: beforeBuf, after: buf });
        this.pendingBeforeBuffers.delete(stepIndex);
      } else {
        log.warn(`No before-assert screenshot found for step ${String(stepIndex)}`);
      }
    } catch (err) {
      log.warn(
        `Failed to capture after-assert screenshot for step ${String(stepIndex)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  recordCursorPosition(position: ScreenshotCollectorResults["cursorPositions"][number]): void {
    this.cursors.push(position);
  }

  async captureChapterTitle(chapterIndex: number, page: PlaywrightPage): Promise<void> {
    try {
      const buf = await page.screenshot();
      this.chapterScreenshots.set(chapterIndex, buf);
    } catch (err) {
      log.warn(
        `Failed to capture chapter title screenshot for chapter ${String(chapterIndex)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  getResults(): ScreenshotCollectorResults {
    return {
      stepScreenshots: new Map(this.stepScreenshots),
      assertScreenshotPairs: [...this.assertPairs],
      cursorPositions: [...this.cursors],
      chapterTitleScreenshots: new Map(this.chapterScreenshots),
    };
  }

  reset(): void {
    this.stepScreenshots.clear();
    this.pendingBeforeBuffers.clear();
    this.assertPairs.length = 0;
    this.cursors.length = 0;
    this.chapterScreenshots.clear();
  }
}

/** Best-effort factory — returns undefined if the module cannot load. */
export function tryCreateCollector(): ScreenshotCollector | undefined {
  try {
    return new ScreenshotCollector();
  } catch (err) {
    log.warn(
      `ScreenshotCollector unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }
}

/** Best-effort result extraction — returns undefined on failure. */
export function collectResults(
  collector: ScreenshotCollector | undefined,
): ScreenshotCollectorResults | undefined {
  if (!collector) return undefined;
  try {
    return collector.getResults();
  } catch (err) {
    log.warn(
      `Failed to collect screenshot data: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }
}
