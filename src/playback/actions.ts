import type { Step } from "../spec/types.js";
import type { ActionEvent, BoundingBox, Pacing } from "./types.js";
import type { PlaywrightPage } from "./playwright.js";
import { resolveStepLocator, selectorForEvent } from "./selector.js";
import { getClickPulseScript } from "./cursor.js";
import { pulseFocus, spawnRipple } from "./visuals.js";

export type { PlaywrightPage } from "./playwright.js";

export interface PlaybackContext {
  page: PlaywrightPage;
  baseUrl: string;
  pacing: Pacing;
  moveCursorTo(box: BoundingBox | null): Promise<void>;
  reinjectCursor(): Promise<void>;
  waitAfterStep(stepIndex: number, step: Step): Promise<void>;
}

type ActionHandler = (
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

function buildEvent(params: EventParams): ActionEvent {
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

function stepTimeoutMs(step: Step): number {
  const v = (step as unknown as { timeoutMs?: unknown }).timeoutMs;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return DEFAULT_ACTION_TIMEOUT_MS;
}

async function ensureTargetReady(
  locator: ReturnType<PlaywrightPage["locator"]>,
  timeoutMs: number,
): Promise<void> {
  await locator.waitFor({ state: "attached", timeout: timeoutMs });
  await locator.scrollIntoViewIfNeeded({ timeout: timeoutMs });
  await locator.waitFor({ state: "visible", timeout: timeoutMs });
}

const handleNavigate: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "navigate") return;
  const waitUntil = (step as unknown as { waitUntil?: unknown }).waitUntil;
  const timeoutMs = stepTimeoutMs(step);
  const url = new URL(step.url, ctx.baseUrl).toString();
  await ctx.page.goto(url, {
    waitUntil:
      waitUntil === "load" || waitUntil === "domcontentloaded" || waitUntil === "networkidle"
        ? waitUntil
        : "domcontentloaded",
    timeout: timeoutMs,
  });
  await ctx.reinjectCursor();
  events.push(buildEvent({ action: "navigate", startTime: start, narration: step.narration }));
  await ctx.waitAfterStep(stepIndex, step);
};

const handleClick: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "click") return;
  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;
  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();
  await ctx.moveCursorTo(box);
  await pulseFocus(ctx.page, box);
  await ctx.page.evaluate(getClickPulseScript());
  await spawnRipple(ctx.page, box);
  await locator.click({ timeout: timeoutMs });
  events.push(
    buildEvent({
      action: "click",
      startTime: start,
      selector: resolved.selectorForEvent,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};

const handleType: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "type") return;
  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;
  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();
  await ctx.moveCursorTo(box);
  await pulseFocus(ctx.page, box);
  const clear = (step as unknown as { clear?: unknown }).clear;
  if (clear === true) {
    await locator.fill("", { timeout: timeoutMs });
  }
  await locator.click({ timeout: timeoutMs });
  await ctx.page.keyboard.type(step.text, { delay: ctx.pacing.typeDelayMs });
  events.push(
    buildEvent({
      action: "type",
      startTime: start,
      selector: resolved.selectorForEvent,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};

const handleHover: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "hover") return;
  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;
  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();
  await ctx.moveCursorTo(box);
  await pulseFocus(ctx.page, box);
  await locator.hover({ timeout: timeoutMs });
  events.push(
    buildEvent({
      action: "hover",
      startTime: start,
      selector: resolved.selectorForEvent,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};

const handleScroll: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "scroll") return;
  const timeoutMs = stepTimeoutMs(step);
  const hasTarget = (step as unknown as { target?: unknown }).target !== undefined;
  const hasSelector = typeof step.selector === "string" && step.selector.length > 0;
  if (hasSelector || hasTarget) {
    // Scroll a specific container/element (not the window).
    const resolved = hasSelector
      ? { locator: ctx.page.locator(step.selector!), selectorForEvent: step.selector! }
      : resolveStepLocator(ctx.page, step);

    const locator = resolved.locator;
    await locator.waitFor({ state: "attached", timeout: timeoutMs });
    await locator.scrollIntoViewIfNeeded({ timeout: timeoutMs });

    const box = await locator.boundingBox();
    await ctx.moveCursorTo(box);
    await pulseFocus(ctx.page, box);

    await locator.evaluate(
      ((el: unknown, delta: { x: number; y: number }) => {
        const node = el as HTMLElement;
        node.scrollBy({ left: delta.x, top: delta.y, behavior: "smooth" });
      }) as (...args: unknown[]) => unknown,
      { x: step.x ?? 0, y: step.y ?? 0 } as unknown,
    );

    events.push(
      buildEvent({
        action: "scroll",
        startTime: start,
        selector: resolved.selectorForEvent,
        boundingBox: box ?? undefined,
        narration: step.narration,
      }),
    );
  } else {
    // Scroll the page (window).
    await ctx.page.evaluate(
      ((x: number, y: number) => {
        window.scrollBy({ left: x, top: y, behavior: "smooth" });
      }) as (...args: unknown[]) => unknown,
      step.x as unknown,
      step.y as unknown,
    );
    events.push(buildEvent({ action: "scroll", startTime: start, narration: step.narration }));
  }
  await ctx.waitAfterStep(stepIndex, step);
};

const handleWait: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "wait") return;
  await ctx.page.waitForTimeout(step.timeout);
  events.push(buildEvent({ action: "wait", startTime: start, narration: step.narration }));
  await ctx.waitAfterStep(stepIndex, step);
};

const handleAssert: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "assert") return;
  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;
  if (step.visible !== undefined) {
    await locator.waitFor({
      state: step.visible ? "visible" : "hidden",
      timeout: timeoutMs,
    });
  }
  if (step.text !== undefined) {
    const deadline = Date.now() + timeoutMs;
    let content: string | null = null;
    while (Date.now() <= deadline) {
      content = await locator.textContent();
      if (content?.includes(step.text)) break;
      await ctx.page.waitForTimeout(200);
    }
    if (!content?.includes(step.text)) {
      throw new Error(`Assertion failed: "${step.text}" not found in ${resolved.selectorForEvent}`);
    }
  }
  await pulseFocus(ctx.page, await locator.boundingBox());
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

const handleScreenshot: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "screenshot") return;
  let options: { path?: string } | undefined;
  if (step.name) {
    // Validate screenshot name is a simple filename (no path separators)
    if (/[/\\]/.test(step.name)) {
      throw new Error(`Invalid screenshot name (path separators not allowed): ${step.name}`);
    }
    options = { path: step.name };
  }
  await ctx.page.screenshot(options);
  events.push(buildEvent({ action: "screenshot", startTime: start, narration: step.narration }));
  await ctx.waitAfterStep(stepIndex, step);
};

const handlePress: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "press") return;
  await ctx.page.keyboard.press(step.key);
  events.push(
    buildEvent({
      action: "press",
      startTime: start,
      selector: selectorForEvent(step),
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};

export const actionHandlers: Record<string, ActionHandler> = {
  navigate: handleNavigate,
  click: handleClick,
  type: handleType,
  hover: handleHover,
  scroll: handleScroll,
  wait: handleWait,
  assert: handleAssert,
  screenshot: handleScreenshot,
  press: handlePress,
};
