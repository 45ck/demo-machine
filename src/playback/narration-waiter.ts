import type { Chapter } from "../spec/types.js";
import { createLogger } from "../utils/logger.js";
import type { PlaywrightPage } from "./actions.js";
import type { Pacing, PlaybackOptions } from "./types.js";

const logger = createLogger("playback");

const POST_CLICK_ACTIONS = new Set<Chapter["steps"][number]["action"]>([
  "click",
  "check",
  "uncheck",
  "select",
  "upload",
  "dragAndDrop",
  "hover",
  "scroll",
  "press",
  "back",
  "forward",
]);

function stepDelayOverrideMs(step: Chapter["steps"][number]): number | undefined {
  const v = (step as unknown as { delay?: unknown }).delay;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return undefined;
}

function baseDelayAfterStep(step: Chapter["steps"][number], pacing: Pacing): number {
  if (step.action === "navigate") return pacing.postNavigateDelayMs;
  const override = stepDelayOverrideMs(step);
  if (step.action === "type") return override ?? pacing.postTypeDelayMs;
  if (POST_CLICK_ACTIONS.has(step.action)) return override ?? pacing.postClickDelayMs;
  return 0;
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

export function createNarrationWaiter(params: {
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
