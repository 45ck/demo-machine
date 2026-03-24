import type { ActionHandler } from "./action-core.js";
import type { PlaywrightPage } from "./playwright.js";
import type { ActionEvent } from "./types.js";
import type { ScreenshotCollector } from "./screenshot-collector.js";
import type { Chapter, Step } from "../spec/types.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("capture-hooks");

const CLICK_ACTIONS = new Set(["click", "clickFirstVisible"]);

function warnCapture(label: string, stepIndex: number, err: unknown): void {
  log.warn(
    `${label} failed for step ${String(stepIndex)}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

async function captureAssertBefore(
  collector: ScreenshotCollector,
  step: Step,
  stepIndex: number,
  page: PlaywrightPage,
): Promise<void> {
  if (step.action !== "assert") return;
  try {
    await collector.captureBeforeAssert(stepIndex, page);
  } catch (err) {
    warnCapture("captureBeforeAssert", stepIndex, err);
  }
}

async function captureAssertAfter(
  collector: ScreenshotCollector,
  step: Step,
  stepIndex: number,
  page: PlaywrightPage,
): Promise<void> {
  if (step.action !== "assert") return;
  try {
    await collector.captureAfterAssert(stepIndex, page);
  } catch (err) {
    warnCapture("captureAfterAssert", stepIndex, err);
  }
}

function recordClickCursor(
  collector: ScreenshotCollector,
  step: Step,
  stepIndex: number,
  events: ActionEvent[],
): void {
  if (!CLICK_ACTIONS.has(step.action)) return;
  try {
    const lastEvent = events[events.length - 1];
    if (!lastEvent?.boundingBox) return;
    const box = lastEvent.boundingBox;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    collector.recordCursorPosition({
      stepIndex,
      cursorX: centerX,
      cursorY: centerY,
      targetCenterX: centerX,
      targetCenterY: centerY,
    });
  } catch (err) {
    warnCapture("recordCursorPosition", stepIndex, err);
  }
}

/**
 * Wraps an ActionHandler with screenshot capture calls.
 *
 * - For assert steps: captures before/after assert screenshots.
 * - For click steps: records cursor position from the event bounding box.
 * - For ALL steps: captures a step screenshot after the handler completes.
 *
 * Collector calls are wrapped in try/catch so they never cause the handler to fail.
 * Handler errors propagate normally.
 */
export function wrapWithScreenshotCapture(
  handler: ActionHandler,
  collector: ScreenshotCollector,
): ActionHandler {
  return async (ctx, step, events, stepIndex) => {
    await captureAssertBefore(collector, step, stepIndex, ctx.page);
    await handler(ctx, step, events, stepIndex);
    await captureAssertAfter(collector, step, stepIndex, ctx.page);
    recordClickCursor(collector, step, stepIndex, events);

    try {
      await collector.captureStep(stepIndex, ctx.page);
    } catch (err) {
      warnCapture("captureStep", stepIndex, err);
    }
  };
}

/**
 * Captures chapter title screenshots for all chapters.
 * Called once at the start of playback or at each chapter boundary.
 * Never throws — all errors are swallowed and logged.
 */
export async function captureChapterTitles(
  collector: ScreenshotCollector,
  page: PlaywrightPage,
  chapters: Chapter[],
): Promise<void> {
  for (let i = 0; i < chapters.length; i++) {
    try {
      await collector.captureChapterTitle(i, page);
    } catch (err) {
      log.warn(
        `captureChapterTitle failed for chapter ${String(i)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
