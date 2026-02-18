import type { Step } from "../spec/types.js";
import type { ActionEvent, BoundingBox, Pacing } from "./types.js";
import type { PlaywrightPage } from "./playwright.js";
import { resolveStepSelector } from "./selector.js";
import { pulseFocus, spawnRipple } from "./visuals.js";

export type { PlaywrightPage } from "./playwright.js";

export interface PlaybackContext {
  page: PlaywrightPage;
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

async function getBoundingBox(page: PlaywrightPage, selector: string): Promise<BoundingBox | null> {
  return page.locator(selector).boundingBox();
}

const handleNavigate: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "navigate") return;
  await ctx.page.goto(step.url);
  await ctx.reinjectCursor();
  events.push(buildEvent({ action: "navigate", startTime: start, narration: step.narration }));
  await ctx.waitAfterStep(stepIndex, step);
};

const handleClick: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "click") return;
  const selector = resolveStepSelector(step);
  const box = await getBoundingBox(ctx.page, selector);
  await ctx.moveCursorTo(box);
  await pulseFocus(ctx.page, box);
  await ctx.page.evaluate((() => {
    const cursor = document.getElementById("dm-cursor");
    if (!cursor) return;
    cursor.style.transform = "translate(-4px, -2px) scale(0.7)";
    setTimeout(() => {
      cursor.style.transform = "translate(-4px, -2px) scale(1)";
    }, 150);
  }) as (...args: unknown[]) => unknown);
  await spawnRipple(ctx.page, box);
  await ctx.page.click(selector);
  events.push(
    buildEvent({
      action: "click",
      startTime: start,
      selector,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};

const handleType: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "type") return;
  const selector = resolveStepSelector(step);
  const box = await getBoundingBox(ctx.page, selector);
  await ctx.moveCursorTo(box);
  await pulseFocus(ctx.page, box);
  await ctx.page.click(selector);
  await ctx.page.keyboard.type(step.text, { delay: ctx.pacing.typeDelayMs });
  events.push(
    buildEvent({
      action: "type",
      startTime: start,
      selector,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};

const handleHover: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "hover") return;
  const selector = resolveStepSelector(step);
  const box = await getBoundingBox(ctx.page, selector);
  await ctx.moveCursorTo(box);
  await pulseFocus(ctx.page, box);
  await ctx.page.hover(selector);
  events.push(
    buildEvent({
      action: "hover",
      startTime: start,
      selector,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};

const handleScroll: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "scroll") return;
  if (step.selector) {
    await ctx.page.evaluate(
      ((sel: string) => {
        const el = document.querySelector(sel);
        el?.scrollIntoView({ behavior: "smooth" });
      }) as (...args: unknown[]) => unknown,
      step.selector as unknown,
    );
    events.push(
      buildEvent({
        action: "scroll",
        startTime: start,
        selector: step.selector,
        narration: step.narration,
      }),
    );
  } else {
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
  const selector = resolveStepSelector(step);
  const locator = ctx.page.locator(selector);
  if (step.visible !== undefined) {
    const isVisible = await locator.isVisible();
    if (isVisible !== step.visible) {
      throw new Error(`Assertion failed: ${selector} visibility is ${String(isVisible)}`);
    }
  }
  if (step.text !== undefined) {
    const content = await locator.textContent();
    if (!content?.includes(step.text)) {
      throw new Error(`Assertion failed: "${step.text}" not found in ${selector}`);
    }
  }
  await pulseFocus(ctx.page, await locator.boundingBox());
  events.push(
    buildEvent({
      action: "assert",
      startTime: start,
      selector,
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
  events.push(buildEvent({ action: "press", startTime: start, narration: step.narration }));
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
