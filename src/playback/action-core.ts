import type { Step } from "../spec/types.js";
import type { ActionEvent, BoundingBox, Pacing } from "./types.js";
import type { PlaywrightPage } from "./playwright.js";

export type { PlaywrightPage } from "./playwright.js";

export interface PlaybackContext {
  page: PlaywrightPage;
  baseUrl: string;
  outputDir?: string | undefined;
  specDir?: string | undefined;
  pacing: Pacing;
  moveCursorTo(box: BoundingBox | null): Promise<void>;
  reinjectCursor(): Promise<void>;
  waitAfterStep(stepIndex: number, step: Step): Promise<void>;
}

export type ActionHandler = (
  ctx: PlaybackContext,
  step: Step,
  events: ActionEvent[],
  stepIndex: number,
) => Promise<void>;

interface EventParams {
  action: string;
  startTime: number;
  selector?: string | undefined;
  boundingBox?: BoundingBox | null | undefined;
  narration?: string | undefined;
}

export function buildEvent(params: EventParams): ActionEvent {
  const event: ActionEvent = {
    action: params.action,
    timestamp: params.startTime,
    duration: Date.now() - params.startTime,
  };
  if (params.selector !== undefined) event.selector = params.selector;
  if (params.boundingBox != null) event.boundingBox = params.boundingBox;
  if (params.narration !== undefined) event.narration = params.narration;
  return event;
}

const DEFAULT_ACTION_TIMEOUT_MS = 15000;

export function stepTimeoutMs(step: Step): number {
  const v = (step as unknown as { timeoutMs?: unknown }).timeoutMs;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return DEFAULT_ACTION_TIMEOUT_MS;
}

export function isTimeoutLikeError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout/i.test(msg);
}

export async function ensureTargetReady(
  locator: ReturnType<PlaywrightPage["locator"]>,
  timeoutMs: number,
): Promise<void> {
  try {
    await locator.waitFor({ state: "attached", timeout: timeoutMs });
  } catch (err) {
    if (isTimeoutLikeError(err)) {
      throw new Error(`Target was not attached within ${String(timeoutMs)}ms`, { cause: err });
    }
    throw err;
  }

  try {
    await locator.scrollIntoViewIfNeeded({ timeout: timeoutMs });
  } catch (err) {
    throw new Error(`Target could not be scrolled into view`, { cause: err });
  }

  try {
    await locator.waitFor({ state: "visible", timeout: timeoutMs });
  } catch (err) {
    if (isTimeoutLikeError(err)) {
      throw new Error(`Target was attached but not visible within ${String(timeoutMs)}ms`, {
        cause: err,
      });
    }
    throw err;
  }
}

export async function ensureTargetAttached(
  locator: ReturnType<PlaywrightPage["locator"]>,
  timeoutMs: number,
): Promise<void> {
  try {
    await locator.waitFor({ state: "attached", timeout: timeoutMs });
  } catch (err) {
    if (isTimeoutLikeError(err)) {
      throw new Error(`Target was not attached within ${String(timeoutMs)}ms`, { cause: err });
    }
    throw err;
  }
}
