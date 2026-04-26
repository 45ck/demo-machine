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
  "selectFirstNonPlaceholder",
  "clickFirstVisible",
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

export function createNarrationWaiter(params: {
  page: PlaywrightPage;
  pacing: Pacing;
  totalSteps: number;
  narration: PlaybackOptions["narration"];
}): {
  leadInMs(stepIndex: number): number;
  waitBeforeStep(stepIndex: number): Promise<void>;
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

  const waitBeforeStep = async (stepIndex: number): Promise<void> => {
    const leadIn = requiredLeadInMs(stepIndex);
    if (leadIn <= 0) return;

    if (narrationMode === "auto-sync") {
      logger.info(
        `Auto-sync: waiting ${String(leadIn)}ms before step ${String(stepIndex)} for narration`,
      );
      await params.page.waitForTimeout(leadIn);
      return;
    }

    if (narrationMode === "warn-only") {
      logger.warn(
        `Narration timing warning: step ${String(stepIndex)} needs ${String(
          leadIn,
        )}ms lead-in but warn-only mode does not pause before actions`,
      );
    }
  };

  const waitAfterStep = async (
    _stepIndex: number,
    step: Chapter["steps"][number],
  ): Promise<void> => {
    const baseDelay = basePostDelayMs(step);
    if (baseDelay > 0) {
      await params.page.waitForTimeout(baseDelay);
    }
  };

  return { leadInMs: requiredLeadInMs, waitBeforeStep, waitAfterStep };
}
