import type { Chapter } from "../spec/types.js";
import { generateBlurStyles } from "../redaction/mask.js";
import { scanForSecrets } from "../redaction/secrets.js";
import { createLogger } from "../utils/logger.js";
import type { PlaywrightPage, PlaybackContext } from "./actions.js";
import { actionHandlers } from "./actions.js";
import { getCursorCSS } from "./cursor.js";
import type { ActionEvent, BoundingBox, Pacing, PlaybackOptions, PlaybackResult } from "./types.js";

const logger = createLogger("playback");

const NO_PACING: Pacing = {
  cursorDurationMs: 0,
  typeDelayMs: 0,
  postClickDelayMs: 0,
  postTypeDelayMs: 0,
  postNavigateDelayMs: 0,
  settleDelayMs: 0,
};

function baseDelayAfterStep(step: Chapter["steps"][number], pacing: Pacing): number {
  switch (step.action) {
    case "navigate":
      return pacing.postNavigateDelayMs;
    case "click":
    case "hover":
    case "scroll":
    case "press":
      return step.delay ?? pacing.postClickDelayMs;
    case "type":
      return step.delay ?? pacing.postTypeDelayMs;
    default:
      return 0;
  }
}

function computeAutoSyncWait(params: {
  mode: import("../utils/narration-sync-types.js").NarrationSyncMode;
  baseDelayMs: number;
  settleMs: number;
  nextLeadInMs: number;
}): { delayMs: number; extraMs: number; baseAvailableMs: number; shouldWarn: boolean } {
  const baseAvailableMs = params.baseDelayMs + params.settleMs;
  const shouldWarn =
    params.mode === "warn-only" && params.nextLeadInMs > 0 && baseAvailableMs < params.nextLeadInMs;
  const extraMs =
    params.mode === "auto-sync" && params.nextLeadInMs > 0
      ? Math.max(0, params.nextLeadInMs - baseAvailableMs)
      : 0;
  return {
    delayMs: params.baseDelayMs + extraMs,
    extraMs,
    baseAvailableMs,
    shouldWarn,
  };
}

async function applyRedaction(page: PlaywrightPage, selectors: string[]): Promise<void> {
  if (selectors.length === 0) return;
  const css = generateBlurStyles(selectors);
  await page.addStyleTag({ content: css });
  logger.info(`Applied redaction to ${String(selectors.length)} selectors`);
}

async function injectCursor(page: PlaywrightPage): Promise<void> {
  const css = getCursorCSS();
  await page.addStyleTag({ content: css });
  await page.evaluate((() => {
    if (!document.getElementById("dm-cursor")) {
      const cursor = document.createElement("div");
      cursor.id = "dm-cursor";
      cursor.style.left = "0px";
      cursor.style.top = "0px";
      document.body.appendChild(cursor);
    }
  }) as (...args: unknown[]) => unknown);
  logger.info("Injected cursor CSS and element");
}

async function checkSecrets(page: PlaywrightPage, patterns: string[]): Promise<void> {
  if (patterns.length === 0) return;
  const text = (await page.evaluate(
    (() => document.body.innerText) as (...args: unknown[]) => unknown,
  )) as string;
  const matches = scanForSecrets(text, patterns);
  for (const match of matches) {
    logger.warn(`Secret detected: pattern="${match.pattern}" text="${match.text}"`);
  }
}

async function executeStep(
  ctx: PlaybackContext,
  step: Chapter["steps"][number],
  params: { events: ActionEvent[]; secretPatterns: string[]; stepIndex: number },
): Promise<void> {
  const handler = actionHandlers[step.action];
  if (!handler) {
    throw new Error(`Unknown action: ${step.action}`);
  }
  await handler(ctx, step, params.events, params.stepIndex);
  if (step.action === "navigate") {
    await checkSecrets(ctx.page, params.secretPatterns);
  }
}

function createNarrationWaiter(params: {
  page: PlaywrightPage;
  pacing: Pacing;
  totalSteps: number;
  narration: PlaybackOptions["narration"];
}): {
  maybeWaitBeforeFirstStep(): Promise<void>;
  waitAfterStep(stepIndex: number, step: Chapter["steps"][number]): Promise<void>;
} {
  const narrationMode = params.narration?.mode ?? "manual";
  const narrationBufferMs = params.narration?.bufferMs ?? 0;
  const narrationTiming = params.narration?.timing;

  const requiredLeadInMs = (stepIndex: number): number => {
    if (!narrationTiming) return 0;
    if (narrationMode === "manual") return 0;
    const entry = narrationTiming.get(stepIndex);
    if (!entry) return 0;
    return entry.durationMs + narrationBufferMs;
  };

  const basePostDelayMs = (step: Chapter["steps"][number]): number => {
    return baseDelayAfterStep(step, params.pacing);
  };

  const maybeWaitBeforeFirstStep = async (): Promise<void> => {
    const firstLeadIn = requiredLeadInMs(0);
    if (firstLeadIn <= 0) return;

    if (narrationMode === "auto-sync") {
      logger.info(`Auto-sync: waiting ${String(firstLeadIn)}ms before first step for narration`);
      await params.page.waitForTimeout(firstLeadIn);
      return;
    }

    if (narrationMode === "warn-only") {
      logger.warn(
        `Narration timing warning: step 0 needs ${String(
          firstLeadIn,
        )}ms lead-in but there is no pre-step delay in warn-only mode`,
      );
    }
  };

  const waitAfterStep = async (
    stepIndex: number,
    step: Chapter["steps"][number],
  ): Promise<void> => {
    const baseDelay = basePostDelayMs(step);
    const nextIndex = stepIndex + 1;
    const nextLeadIn = nextIndex < params.totalSteps ? requiredLeadInMs(nextIndex) : 0;

    const settleMs = params.pacing.settleDelayMs;
    const calc = computeAutoSyncWait({
      mode: narrationMode,
      baseDelayMs: baseDelay,
      settleMs,
      nextLeadInMs: nextLeadIn,
    });

    if (calc.shouldWarn) {
      logger.warn(
        `Narration timing warning: next step ${String(nextIndex)} needs ${String(
          nextLeadIn,
        )}ms lead-in but current delay is ${String(calc.baseAvailableMs)}ms`,
      );
    }

    if (narrationMode === "auto-sync" && calc.extraMs > 0) {
      logger.info(
        `Auto-sync: extended delay after step ${String(stepIndex)} to ${String(calc.delayMs)}ms (min ${String(
          baseDelay,
        )}ms + settle ${String(settleMs)}ms, next narration needs ${String(nextLeadIn)}ms)`,
      );
    }

    if (calc.delayMs > 0) {
      await params.page.waitForTimeout(calc.delayMs);
    }
  };

  return { maybeWaitBeforeFirstStep, waitAfterStep };
}

export class PlaybackEngine {
  private readonly page: PlaywrightPage;
  private readonly options: PlaybackOptions;
  private cursorPosition = { x: 0, y: 0 };

  constructor(page: PlaywrightPage, options: PlaybackOptions) {
    this.page = page;
    this.options = options;
  }

  private async moveCursorTo(box: BoundingBox | null): Promise<void> {
    if (!box) return;
    const pacing = this.options.pacing ?? NO_PACING;
    if (pacing.cursorDurationMs === 0) return;
    const targetX = box.x + box.width / 2;
    const targetY = box.y + box.height / 2;
    await this.page.evaluate(
      ((p: { fromX: number; fromY: number; toX: number; toY: number; durationMs: number }) => {
        let cursor = document.getElementById("dm-cursor");
        if (!cursor) {
          cursor = document.createElement("div");
          cursor.id = "dm-cursor";
          document.body.appendChild(cursor);
        }
        const startX = p.fromX;
        const startY = p.fromY;
        const endX = p.toX;
        const endY = p.toY;
        const duration = p.durationMs;
        const start = performance.now();

        function ease(t: number): number {
          const mt = 1 - t;
          return 3 * mt * mt * t * 0.42 + 3 * mt * t * t * 0.58 + t * t * t;
        }

        function animate(now: number): void {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = ease(progress);
          const x = startX + (endX - startX) * eased;
          const y = startY + (endY - startY) * eased;
          cursor!.style.left = x + "px";
          cursor!.style.top = y + "px";
          if (progress < 1) {
            requestAnimationFrame(animate);
          }
        }

        cursor.style.left = startX + "px";
        cursor.style.top = startY + "px";
        requestAnimationFrame(animate);
      }) as (...args: unknown[]) => unknown,
      {
        fromX: this.cursorPosition.x,
        fromY: this.cursorPosition.y,
        toX: targetX,
        toY: targetY,
        durationMs: pacing.cursorDurationMs,
      } as unknown,
    );
    await this.page.waitForTimeout(pacing.cursorDurationMs);
    this.cursorPosition = { x: targetX, y: targetY };
  }

  async execute(chapters: Chapter[]): Promise<PlaybackResult> {
    const events: ActionEvent[] = [];
    const startTimestamp = Date.now();
    const pacing = this.options.pacing ?? NO_PACING;
    const totalSteps = chapters.reduce((sum, ch) => sum + ch.steps.length, 0);
    const narrationWaiter = createNarrationWaiter({
      page: this.page,
      pacing,
      totalSteps,
      narration: this.options.narration,
    });

    await applyRedaction(this.page, this.options.redactionSelectors ?? []);

    if (this.options.pacing) {
      await injectCursor(this.page);
    }

    await narrationWaiter.maybeWaitBeforeFirstStep();

    const ctx: PlaybackContext = {
      page: this.page,
      pacing,
      moveCursorTo: (box) => this.moveCursorTo(box),
      reinjectCursor: () => (this.options.pacing ? injectCursor(this.page) : Promise.resolve()),
      waitAfterStep: (stepIndex, step) => narrationWaiter.waitAfterStep(stepIndex, step),
    };

    let stepIndex = 0;
    for (const chapter of chapters) {
      logger.info(`Starting chapter: ${chapter.title}`);
      for (const step of chapter.steps) {
        await executeStep(ctx, step, {
          events,
          secretPatterns: this.options.secretPatterns ?? [],
          stepIndex,
        });
        if (this.options.onStepComplete && events.length > 0) {
          await this.options.onStepComplete(events[events.length - 1]!);
        }
        if (pacing.settleDelayMs > 0) {
          await this.page.waitForTimeout(pacing.settleDelayMs);
        }
        stepIndex++;
      }
    }

    return {
      events,
      durationMs: Date.now() - startTimestamp,
      startTimestamp,
    };
  }
}
