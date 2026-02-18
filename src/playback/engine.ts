import type { Chapter } from "../spec/types.js";
import { createLogger } from "../utils/logger.js";
import type { PlaywrightPage, PlaybackContext } from "./actions.js";
import { actionHandlers } from "./actions.js";
import { PlaybackStepError } from "./errors.js";
import type { ActionEvent, BoundingBox, Pacing, PlaybackOptions, PlaybackResult } from "./types.js";
import { selectorForEvent, selectorForEventFromInput, type Target } from "./selector.js";
import { createNarrationWaiter } from "./narration-waiter.js";
import { applyRedaction, checkSecrets, injectCursor } from "./overlays.js";

const logger = createLogger("playback");

const NO_PACING: Pacing = {
  cursorDurationMs: 0,
  typeDelayMs: 0,
  postClickDelayMs: 0,
  postTypeDelayMs: 0,
  postNavigateDelayMs: 0,
  settleDelayMs: 0,
};

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

function selectorForError(step: Chapter["steps"][number]): string {
  if (step.action !== "dragAndDrop") return selectorForEvent(step);
  const from = selectorForEventFromInput(
    {
      selector: step.from.selector,
      target: step.from.target as unknown as Target,
      nth: step.from.nth,
    },
    "from(?)",
  );
  const to = selectorForEventFromInput(
    {
      selector: step.to.selector,
      target: step.to.target as unknown as Target,
      nth: step.to.nth,
    },
    "to(?)",
  );
  return `${from} -> ${to}`;
}

function raisePlaybackStepError(params: {
  stepIndex: number;
  chapterTitle: string;
  step: Chapter["steps"][number];
  selector: string;
  events: ActionEvent[];
  startTimestamp: number;
  cause: unknown;
}): never {
  throw new PlaybackStepError({
    stepIndex: params.stepIndex,
    chapterTitle: params.chapterTitle,
    step: params.step,
    selectorForEvent: params.selector,
    events: [...params.events],
    startTimestamp: params.startTimestamp,
    cause: params.cause,
  });
}

async function executeStepOrRaise(params: {
  ctx: PlaybackContext;
  step: Chapter["steps"][number];
  events: ActionEvent[];
  secretPatterns: string[];
  stepIndex: number;
  chapterTitle: string;
  selector: string;
  startTimestamp: number;
}): Promise<void> {
  try {
    await executeStep(params.ctx, params.step, {
      events: params.events,
      secretPatterns: params.secretPatterns,
      stepIndex: params.stepIndex,
    });
  } catch (err) {
    raisePlaybackStepError({
      stepIndex: params.stepIndex,
      chapterTitle: params.chapterTitle,
      step: params.step,
      selector: params.selector,
      events: params.events,
      startTimestamp: params.startTimestamp,
      cause: err,
    });
  }
}

async function settleOrRaise(params: {
  page: PlaywrightPage;
  settleDelayMs: number;
  stepIndex: number;
  chapterTitle: string;
  step: Chapter["steps"][number];
  selector: string;
  events: ActionEvent[];
  startTimestamp: number;
}): Promise<void> {
  if (params.settleDelayMs <= 0) return;
  try {
    await params.page.waitForTimeout(params.settleDelayMs);
  } catch (err) {
    raisePlaybackStepError({
      stepIndex: params.stepIndex,
      chapterTitle: params.chapterTitle,
      step: params.step,
      selector: params.selector,
      events: params.events,
      startTimestamp: params.startTimestamp,
      cause: err,
    });
  }
}

async function onStepCompleteMaybe(params: {
  onStepComplete?: ((event: ActionEvent) => Promise<void>) | undefined;
  events: ActionEvent[];
}): Promise<void> {
  if (!params.onStepComplete) return;
  if (params.events.length === 0) return;
  await params.onStepComplete(params.events[params.events.length - 1]!);
}

async function runChapters(params: {
  chapters: Chapter[];
  ctx: PlaybackContext;
  page: PlaywrightPage;
  secretPatterns: string[];
  settleDelayMs: number;
  onStepComplete?: ((event: ActionEvent) => Promise<void>) | undefined;
  events: ActionEvent[];
  startTimestamp: number;
}): Promise<void> {
  let stepIndex = 0;
  for (const chapter of params.chapters) {
    logger.info(`Starting chapter: ${chapter.title}`);
    for (const step of chapter.steps) {
      const selector = selectorForError(step);
      await executeStepOrRaise({
        ctx: params.ctx,
        step,
        events: params.events,
        secretPatterns: params.secretPatterns,
        stepIndex,
        chapterTitle: chapter.title,
        selector,
        startTimestamp: params.startTimestamp,
      });

      // User callback errors should propagate as-is (caller-owned failure mode).
      await onStepCompleteMaybe({ onStepComplete: params.onStepComplete, events: params.events });

      await settleOrRaise({
        page: params.page,
        settleDelayMs: params.settleDelayMs,
        stepIndex,
        chapterTitle: chapter.title,
        step,
        selector,
        events: params.events,
        startTimestamp: params.startTimestamp,
      });

      stepIndex++;
    }
  }
}

export class PlaybackEngine {
  private readonly page: PlaywrightPage;
  private readonly options: PlaybackOptions;
  private cursorPosition = { x: 0, y: 0 };

  constructor(page: PlaywrightPage, options: PlaybackOptions) {
    this.page = page;
    this.options = options;
  }

  private async reinjectOverlays(): Promise<void> {
    await applyRedaction(this.page, this.options.redactionSelectors ?? []);
    if (this.options.pacing) {
      await injectCursor(this.page);
    }
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

    await this.reinjectOverlays();

    await narrationWaiter.maybeWaitBeforeFirstStep();

    const ctx: PlaybackContext = {
      page: this.page,
      baseUrl: this.options.baseUrl,
      specDir: this.options.specDir,
      pacing,
      moveCursorTo: (box) => this.moveCursorTo(box),
      reinjectCursor: () => this.reinjectOverlays(),
      waitAfterStep: (stepIndex, step) => narrationWaiter.waitAfterStep(stepIndex, step),
    };

    await runChapters({
      chapters,
      ctx,
      page: this.page,
      secretPatterns: this.options.secretPatterns ?? [],
      settleDelayMs: pacing.settleDelayMs,
      onStepComplete: this.options.onStepComplete,
      events,
      startTimestamp,
    });

    return {
      events,
      durationMs: Date.now() - startTimestamp,
      startTimestamp,
    };
  }
}
