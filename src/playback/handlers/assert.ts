import type { ActionHandler } from "../action-core.js";
import { buildEvent, stepTimeoutMs, isTimeoutLikeError } from "../action-core.js";
import { resolveStepLocator } from "../selector.js";
import type { PlaywrightLocator } from "../playwright.js";

function truncateText(value: string | null | undefined, maxLen = 160): string {
  if (!value) return "";
  return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
}

async function assertVisibility(params: {
  locator: PlaywrightLocator;
  visible: boolean;
  timeoutMs: number;
  selectorForEvent: string;
}): Promise<void> {
  try {
    await params.locator.waitFor({
      state: params.visible ? "visible" : "hidden",
      timeout: params.timeoutMs,
    });
  } catch (err) {
    if (!isTimeoutLikeError(err)) throw err;
    const expectation = params.visible ? "visible" : "hidden";
    throw new Error(
      `Assertion failed: expected ${params.selectorForEvent} to be ${expectation} within ${String(params.timeoutMs)}ms`,
      { cause: err },
    );
  }
}

async function assertTextContains(params: {
  page: { waitForTimeout(ms: number): Promise<void> };
  locator: PlaywrightLocator;
  timeoutMs: number;
  expectedText: string;
  selectorForEvent: string;
}): Promise<void> {
  const deadline = Date.now() + params.timeoutMs;
  let content: string | null = null;

  while (Date.now() <= deadline) {
    content = await params.locator.textContent();
    if (content?.includes(params.expectedText)) return;
    await params.page.waitForTimeout(200);
  }

  throw new Error(
    `Assertion failed: text "${params.expectedText}" not found in ${params.selectorForEvent} within ${String(params.timeoutMs)}ms (last text: "${truncateText(content)}")`,
  );
}

export const handleAssert: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "assert") return;

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  if (step.visible !== undefined) {
    await assertVisibility({
      locator,
      visible: step.visible,
      timeoutMs,
      selectorForEvent: resolved.selectorForEvent,
    });
  }

  if (step.text !== undefined) {
    await assertTextContains({
      page: ctx.page,
      locator,
      timeoutMs,
      expectedText: step.text,
      selectorForEvent: resolved.selectorForEvent,
    });
  }

  events.push(
    buildEvent({
      action: "assert",
      startTime: start,
      selector: resolved.selectorForEvent,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};
