/* eslint-disable max-lines */
import type { Chapter } from "../spec/types.js";
import { createLogger } from "../utils/logger.js";
import type { PlaywrightPage, PlaybackContext } from "./actions.js";
import { actionHandlers } from "./actions.js";
import { PlaybackStepError } from "./errors.js";
import type { ActionEvent, BoundingBox, Pacing, PlaybackOptions, PlaybackResult } from "./types.js";
import { selectorForEvent, selectorForEventFromInput, type Target } from "./selector.js";
import { createNarrationWaiter } from "./narration-waiter.js";
import { applyRedaction, checkSecrets, hideCursor, injectCursor } from "./overlays.js";
import { ChangeDetectionOrchestrator } from "./change-detection/orchestrator.js";
import { detectOverlayLeaks } from "./overlay-leak-detector.js";
import { checkAriaRoleConsistency } from "./a11y-guards.js";
import { wrapWithScreenshotCapture } from "./capture-hooks.js";
import type { ScreenshotCollector } from "./screenshot-collector.js";
import { prepareNarrationFocus, resetNarrationFocus } from "./narration-focus.js";

const logger = createLogger("playback");

/** Actions that mutate the DOM and warrant a post-step ARIA consistency audit. */
const INTERACTIVE_ACTIONS = new Set([
  "click",
  "clickFirstVisible",
  "type",
  "check",
  "uncheck",
  "select",
  "selectFirstNonPlaceholder",
  "dragAndDrop",
  "press",
]);

const NO_PACING: Pacing = {
  cursorDurationMs: 0,
  typeDelayMs: 0,
  postClickDelayMs: 0,
  postTypeDelayMs: 0,
  postNavigateDelayMs: 0,
  settleDelayMs: 0,
};

const DEFAULT_NARRATION_FOCUS = {
  enabled: true,
  cursor: true,
  highlight: true,
  zoom: true,
  scale: 1.35,
  durationMs: 2600,
  transitionMs: 700,
};

async function executeStep(
  ctx: PlaybackContext,
  step: Chapter["steps"][number],
  params: {
    events: ActionEvent[];
    redactionSelectors: string[];
    secretPatterns: string[];
    stepIndex: number;
    screenshotCollector?: ScreenshotCollector | undefined;
  },
): Promise<void> {
  const handler = actionHandlers[step.action];
  if (!handler) {
    throw new Error(`Unknown action: ${step.action}`);
  }
  const effectiveHandler = params.screenshotCollector
    ? wrapWithScreenshotCapture(handler, params.screenshotCollector)
    : handler;
  await effectiveHandler(ctx, step, params.events, params.stepIndex);
  await checkSecrets(ctx.page, params.secretPatterns, params.redactionSelectors);
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
  redactionSelectors: string[];
  secretPatterns: string[];
  stepIndex: number;
  chapterTitle: string;
  selector: string;
  startTimestamp: number;
  screenshotCollector?: ScreenshotCollector | undefined;
}): Promise<void> {
  try {
    await executeStep(params.ctx, params.step, {
      events: params.events,
      redactionSelectors: params.redactionSelectors,
      secretPatterns: params.secretPatterns,
      stepIndex: params.stepIndex,
      screenshotCollector: params.screenshotCollector,
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

async function captureChapterBoundaryMaybe(params: {
  screenshotCollector?: ScreenshotCollector | undefined;
  chapterIndex: number;
  page: PlaywrightPage;
  captured: boolean;
}): Promise<boolean> {
  if (params.captured) return true;
  await params.screenshotCollector?.captureChapterTitle(params.chapterIndex, params.page);
  return true;
}

function attachEvidence(
  events: ActionEvent[],
  signals: import("./change-detection/types.js").DetectorSignal[],
): void {
  const last = events[events.length - 1];
  if (last && signals.length > 0) last.evidence = { changeDetection: signals };
}

interface RunChaptersParams {
  chapters: Chapter[];
  ctx: PlaybackContext;
  page: PlaywrightPage;
  redactionSelectors: string[];
  secretPatterns: string[];
  settleDelayMs: number;
  onStepComplete?: ((event: ActionEvent) => Promise<void>) | undefined;
  changeDetection?: ChangeDetectionOrchestrator | undefined;
  events: ActionEvent[];
  startTimestamp: number;
  screenshotCollector?: ScreenshotCollector | undefined;
  beforeStep?: ((stepIndex: number, step: Chapter["steps"][number]) => Promise<void>) | undefined;
  afterStep?: (() => Promise<void>) | undefined;
}

async function maybeCaptureBeforeStep(params: {
  run: RunChaptersParams;
  chapterIndex: number;
  step: Chapter["steps"][number];
  captured: boolean;
}): Promise<boolean> {
  if (params.step.action === "navigate") return params.captured;
  return captureChapterBoundaryMaybe({
    screenshotCollector: params.run.screenshotCollector,
    chapterIndex: params.chapterIndex,
    page: params.run.page,
    captured: params.captured,
  });
}

async function maybeCaptureAfterStep(params: {
  run: RunChaptersParams;
  chapterIndex: number;
  step: Chapter["steps"][number];
  captured: boolean;
}): Promise<boolean> {
  if (params.step.action !== "navigate") return params.captured;
  return captureChapterBoundaryMaybe({
    screenshotCollector: params.run.screenshotCollector,
    chapterIndex: params.chapterIndex,
    page: params.run.page,
    captured: params.captured,
  });
}

async function auditAfterStep(params: {
  run: RunChaptersParams;
  step: Chapter["steps"][number];
  stepIndex: number;
  chapterTitle: string;
  shouldCheck: boolean;
}): Promise<void> {
  if (params.shouldCheck && params.run.changeDetection) {
    const signals = await params.run.changeDetection.after({
      page: params.run.page,
      step: params.step,
      stepIndex: params.stepIndex,
      chapterTitle: params.chapterTitle,
    });
    attachEvidence(params.run.events, signals);
  }

  if (INTERACTIVE_ACTIONS.has(params.step.action)) {
    await checkAriaRoleConsistency(params.run.page);
  }
}

async function runChapter(params: {
  run: RunChaptersParams;
  chapter: Chapter;
  chapterIndex: number;
  startStepIndex: number;
}): Promise<number> {
  let stepIndex = params.startStepIndex;
  let capturedChapterBoundary = false;
  for (const step of params.chapter.steps) {
    capturedChapterBoundary = await maybeCaptureBeforeStep({
      run: params.run,
      chapterIndex: params.chapterIndex,
      step,
      captured: capturedChapterBoundary,
    });
    const selector = selectorForError(step);
    const shouldCheck = params.run.changeDetection?.shouldCheck(step) ?? false;

    if (shouldCheck && params.run.changeDetection) {
      await params.run.changeDetection.before(params.run.page, step);
    }

    await params.run.beforeStep?.(stepIndex, step);
    try {
      await executeStepOrRaise({
        ctx: params.run.ctx,
        step,
        events: params.run.events,
        redactionSelectors: params.run.redactionSelectors,
        secretPatterns: params.run.secretPatterns,
        stepIndex,
        chapterTitle: params.chapter.title,
        selector,
        startTimestamp: params.run.startTimestamp,
        screenshotCollector: params.run.screenshotCollector,
      });
    } finally {
      await params.run.afterStep?.();
    }

    capturedChapterBoundary = await maybeCaptureAfterStep({
      run: params.run,
      chapterIndex: params.chapterIndex,
      step,
      captured: capturedChapterBoundary,
    });

    await onStepCompleteMaybe({
      onStepComplete: params.run.onStepComplete,
      events: params.run.events,
    });
    await settleOrRaise({
      page: params.run.page,
      settleDelayMs: params.run.settleDelayMs,
      stepIndex,
      chapterTitle: params.chapter.title,
      step,
      selector,
      events: params.run.events,
      startTimestamp: params.run.startTimestamp,
    });
    await auditAfterStep({
      run: params.run,
      step,
      stepIndex,
      chapterTitle: params.chapter.title,
      shouldCheck,
    });
    stepIndex++;
  }
  await captureChapterBoundaryMaybe({
    screenshotCollector: params.run.screenshotCollector,
    chapterIndex: params.chapterIndex,
    page: params.run.page,
    captured: capturedChapterBoundary,
  });
  return stepIndex;
}

async function runChapters(params: RunChaptersParams): Promise<void> {
  let stepIndex = 0;
  for (let chapterIndex = 0; chapterIndex < params.chapters.length; chapterIndex++) {
    const chapter = params.chapters[chapterIndex]!;
    logger.info(`Starting chapter: ${chapter.title}`);
    stepIndex = await runChapter({
      run: params,
      chapter,
      chapterIndex,
      startStepIndex: stepIndex,
    });
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

  private async moveCursorTo(box: BoundingBox | null, mapForNarrationFocus = false): Promise<void> {
    if (!box) return;
    const pacing = this.options.pacing ?? NO_PACING;
    if (pacing.cursorDurationMs === 0) return;
    await injectCursor(this.page);
    const rawTargetX = box.x + box.width / 2;
    const rawTargetY = box.y + box.height / 2;
    const activeTransform = mapForNarrationFocus
      ? ((await this.page.evaluate((() => {
          const w = window as typeof window & {
            __dmNarrationFocusTransform?: { tx: number; ty: number; scale: number };
          };
          return w.__dmNarrationFocusTransform ?? null;
        }) as (...args: unknown[]) => unknown)) as { tx: number; ty: number; scale: number } | null)
      : null;
    const targetX = activeTransform
      ? activeTransform.tx + rawTargetX * activeTransform.scale
      : rawTargetX;
    const targetY = activeTransform
      ? activeTransform.ty + rawTargetY * activeTransform.scale
      : rawTargetY;
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

  private async prepareStepPresentation(
    stepIndex: number,
    step: Chapter["steps"][number],
    narrationWaiter: ReturnType<typeof createNarrationWaiter>,
    stepsWithPresentedActionVisual: Set<number>,
  ): Promise<void> {
    const leadInMs = narrationWaiter.leadInMs(stepIndex);
    const hasNarrationTiming = this.options.narration !== undefined;
    const hasExplicitManualFocus = this.options.presentation?.narrationFocus !== undefined;
    if (!hasNarrationTiming && !hasExplicitManualFocus) {
      await narrationWaiter.waitBeforeStep(stepIndex);
      return;
    }
    const focus = this.options.presentation?.narrationFocus ?? DEFAULT_NARRATION_FOCUS;
    const preparedFocus = await prepareNarrationFocus({
      page: this.page,
      step,
      focus,
      moveCursorTo: (box) => this.moveCursorTo(box, true),
    });
    if (preparedFocus && leadInMs <= 0) {
      const setupMs = Math.min(
        450,
        Math.max(180, Math.round(preparedFocus.focus.transitionMs / 2)),
      );
      await this.page.waitForTimeout(setupMs);
    }
    await narrationWaiter.waitBeforeStep(stepIndex);
    if (preparedFocus?.canShowActionPulse) {
      stepsWithPresentedActionVisual.add(stepIndex);
    }
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

    // Initialize change detection if configured.
    let changeDetection: ChangeDetectionOrchestrator | undefined;
    if (this.options.changeDetection && this.options.changeDetection.mode !== "off") {
      changeDetection = new ChangeDetectionOrchestrator(this.options.changeDetection);
      await changeDetection.setup(this.page);
    }

    const stepsWithFocusedPresentation = new Set<number>();
    const ctx: PlaybackContext = {
      page: this.page,
      baseUrl: this.options.baseUrl,
      outputDir: this.options.outputDir,
      specDir: this.options.specDir,
      pacing,
      moveCursorTo: (box) => this.moveCursorTo(box),
      reinjectCursor: () => this.reinjectOverlays(),
      waitAfterStep: (stepIndex, step) => narrationWaiter.waitAfterStep(stepIndex, step),
      shouldShowActionFocusVisuals: (stepIndex) => !stepsWithFocusedPresentation.has(stepIndex),
    };

    await runChapters({
      chapters,
      ctx,
      page: this.page,
      redactionSelectors: this.options.redactionSelectors ?? [],
      secretPatterns: this.options.secretPatterns ?? [],
      settleDelayMs: pacing.settleDelayMs,
      onStepComplete: this.options.onStepComplete,
      changeDetection,
      events,
      startTimestamp,
      screenshotCollector: this.options.screenshotCollector,
      beforeStep: (stepIndex, step) =>
        this.prepareStepPresentation(
          stepIndex,
          step,
          narrationWaiter,
          stepsWithFocusedPresentation,
        ),
      afterStep: async () => {
        await resetNarrationFocus(this.page);
      },
    });

    await hideCursor(this.page);

    // Post-playback: scan for orphaned overlay elements.
    const overlayLeaks = await detectOverlayLeaks(this.page);
    for (const leak of overlayLeaks) {
      logger.warn(leak);
    }

    return {
      events,
      durationMs: Date.now() - startTimestamp,
      startTimestamp,
    };
  }
}
