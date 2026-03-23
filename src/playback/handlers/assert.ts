import type { ActionHandler } from "../action-core.js";
import { buildEvent, stepTimeoutMs, isTimeoutLikeError } from "../action-core.js";
import { resolveStepLocator } from "../selector.js";
import type { PlaywrightLocator, PlaywrightPage } from "../playwright.js";

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

async function assertCount(params: {
  page: PlaywrightPage;
  selector: string;
  expectedCount: number;
  timeoutMs: number;
  selectorForEvent: string;
}): Promise<void> {
  const deadline = Date.now() + params.timeoutMs;
  let lastCount = -1;

  while (Date.now() <= deadline) {
    lastCount = (await params.page.evaluate(
      ((sel: string) => document.querySelectorAll(sel).length) as (...args: unknown[]) => unknown,
      params.selector as unknown,
    )) as number;
    if (lastCount === params.expectedCount) return;
    await params.page.waitForTimeout(200);
  }

  throw new Error(
    `Assertion failed: expected ${params.selectorForEvent} count to be ${String(params.expectedCount)} but was ${String(lastCount)} within ${String(params.timeoutMs)}ms`,
  );
}

async function assertValue(params: {
  page: { waitForTimeout(ms: number): Promise<void> };
  locator: PlaywrightLocator;
  expectedValue: string;
  timeoutMs: number;
  selectorForEvent: string;
}): Promise<void> {
  const deadline = Date.now() + params.timeoutMs;
  let lastValue = "";

  while (Date.now() <= deadline) {
    lastValue = (await params.locator.evaluate(
      ((el: unknown) => (el as HTMLInputElement).value ?? "") as (...args: unknown[]) => unknown,
    )) as string;
    if (lastValue === params.expectedValue) return;
    await params.page.waitForTimeout(200);
  }

  throw new Error(
    `Assertion failed: expected value "${params.expectedValue}" on ${params.selectorForEvent} but got "${truncateText(lastValue)}" within ${String(params.timeoutMs)}ms`,
  );
}

async function assertChecked(params: {
  page: { waitForTimeout(ms: number): Promise<void> };
  locator: PlaywrightLocator;
  expectedChecked: boolean;
  timeoutMs: number;
  selectorForEvent: string;
}): Promise<void> {
  const deadline = Date.now() + params.timeoutMs;
  let lastState = !params.expectedChecked;

  while (Date.now() <= deadline) {
    lastState = (await params.locator.evaluate(
      ((el: unknown) => (el as HTMLInputElement).checked ?? false) as (
        ...args: unknown[]
      ) => unknown,
    )) as boolean;
    if (lastState === params.expectedChecked) return;
    await params.page.waitForTimeout(200);
  }

  throw new Error(
    `Assertion failed: expected ${params.selectorForEvent} to be ${params.expectedChecked ? "checked" : "unchecked"} within ${String(params.timeoutMs)}ms`,
  );
}

async function assertEnabled(params: {
  page: { waitForTimeout(ms: number): Promise<void> };
  locator: PlaywrightLocator;
  expectedEnabled: boolean;
  timeoutMs: number;
  selectorForEvent: string;
}): Promise<void> {
  const deadline = Date.now() + params.timeoutMs;
  let lastState = !params.expectedEnabled;

  while (Date.now() <= deadline) {
    lastState = (await params.locator.evaluate(
      ((el: unknown) => !(el as HTMLElement).hasAttribute("disabled")) as (
        ...args: unknown[]
      ) => unknown,
    )) as boolean;
    if (lastState === params.expectedEnabled) return;
    await params.page.waitForTimeout(200);
  }

  throw new Error(
    `Assertion failed: expected ${params.selectorForEvent} to be ${params.expectedEnabled ? "enabled" : "disabled"} within ${String(params.timeoutMs)}ms`,
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

  if ((step as { count?: number }).count !== undefined) {
    const cssSelector = (step as { selector?: string }).selector;
    if (!cssSelector) {
      throw new Error(
        `assert count requires a CSS "selector" (not "target") because it uses querySelectorAll`,
      );
    }
    await assertCount({
      page: ctx.page,
      selector: cssSelector,
      expectedCount: (step as { count: number }).count,
      timeoutMs,
      selectorForEvent: resolved.selectorForEvent,
    });
  }

  if ((step as { value?: string }).value !== undefined) {
    await assertValue({
      page: ctx.page,
      locator,
      expectedValue: (step as { value: string }).value,
      timeoutMs,
      selectorForEvent: resolved.selectorForEvent,
    });
  }

  if ((step as { checked?: boolean }).checked !== undefined) {
    await assertChecked({
      page: ctx.page,
      locator,
      expectedChecked: (step as { checked: boolean }).checked,
      timeoutMs,
      selectorForEvent: resolved.selectorForEvent,
    });
  }

  if ((step as { enabled?: boolean }).enabled !== undefined) {
    await assertEnabled({
      page: ctx.page,
      locator,
      expectedEnabled: (step as { enabled: boolean }).enabled,
      timeoutMs,
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
