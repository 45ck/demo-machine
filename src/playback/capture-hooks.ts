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

async function readCursorTip(page: PlaywrightPage): Promise<{ x: number; y: number } | undefined> {
  return (await page.evaluate((() => {
    const cursor = document.getElementById("dm-cursor");
    if (!cursor) return undefined;
    const rect = cursor.getBoundingClientRect();
    return { x: rect.left + 4, y: rect.top + 2 };
  }) as (...args: unknown[]) => unknown)) as { x: number; y: number } | undefined;
}

async function recordClickCursor(params: {
  collector: ScreenshotCollector;
  step: Step;
  stepIndex: number;
  page: PlaywrightPage;
  events: ActionEvent[];
}): Promise<void> {
  if (!CLICK_ACTIONS.has(params.step.action)) return;
  try {
    const lastEvent = params.events[params.events.length - 1];
    if (!lastEvent?.boundingBox) return;
    const box = lastEvent.boundingBox;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const cursorTip = await readCursorTip(params.page);
    params.collector.recordCursorPosition({
      stepIndex: params.stepIndex,
      cursorX: cursorTip?.x ?? centerX,
      cursorY: cursorTip?.y ?? centerY,
      targetCenterX: centerX,
      targetCenterY: centerY,
    });
  } catch (err) {
    warnCapture("recordCursorPosition", params.stepIndex, err);
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
    await recordClickCursor({ collector, step, stepIndex, page: ctx.page, events });

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
