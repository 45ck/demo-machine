import type { Step } from "../spec/types.js";
import type { ActionEvent, BoundingBox, Pacing } from "./types.js";

export interface PlaywrightLocator {
  isVisible(): Promise<boolean>;
  textContent(): Promise<string | null>;
  boundingBox(): Promise<BoundingBox | null>;
}

export interface PlaywrightElement {
  boundingBox(): Promise<BoundingBox | null>;
}

export interface PlaywrightPage {
  goto(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  hover(selector: string): Promise<void>;
  keyboard: {
    press(key: string): Promise<void>;
    type(text: string, options?: { delay?: number | undefined }): Promise<void>;
  };
  waitForTimeout(ms: number): Promise<void>;
  locator(selector: string): PlaywrightLocator;
  evaluate(fn: string | ((...args: unknown[]) => unknown), ...args: unknown[]): Promise<unknown>;
  screenshot(options?: { path?: string }): Promise<Buffer>;
  addStyleTag(options: { content: string }): Promise<void>;
  $(selector: string): Promise<PlaywrightElement | null>;
}

export interface PlaybackContext {
  page: PlaywrightPage;
  pacing: Pacing;
  moveCursorTo(box: BoundingBox | null): Promise<void>;
  reinjectCursor(): Promise<void>;
}

type ActionHandler = (ctx: PlaybackContext, step: Step, events: ActionEvent[]) => Promise<void>;

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
  const element = await page.$(selector);
  if (!element) return null;
  return element.boundingBox();
}

const handleNavigate: ActionHandler = async (ctx, step, events) => {
  const start = Date.now();
  if (step.action !== "navigate") return;
  await ctx.page.goto(step.url);
  await ctx.reinjectCursor();
  events.push(buildEvent({ action: "navigate", startTime: start, narration: step.narration }));
  await ctx.page.waitForTimeout(ctx.pacing.postNavigateDelayMs);
};

const handleClick: ActionHandler = async (ctx, step, events) => {
  const start = Date.now();
  if (step.action !== "click") return;
  const box = await getBoundingBox(ctx.page, step.selector);
  await ctx.moveCursorTo(box);
  await ctx.page.evaluate((() => {
    const cursor = document.getElementById("dm-cursor");
    if (!cursor) return;
    cursor.style.transform = "translate(-4px, -2px) scale(0.7)";
    setTimeout(() => {
      cursor.style.transform = "translate(-4px, -2px) scale(1)";
    }, 150);
  }) as (...args: unknown[]) => unknown);
  await ctx.page.click(step.selector);
  events.push(
    buildEvent({
      action: "click",
      startTime: start,
      selector: step.selector,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.page.waitForTimeout(step.delay ?? ctx.pacing.postClickDelayMs);
};

const handleType: ActionHandler = async (ctx, step, events) => {
  const start = Date.now();
  if (step.action !== "type") return;
  const box = await getBoundingBox(ctx.page, step.selector);
  await ctx.moveCursorTo(box);
  await ctx.page.click(step.selector);
  await ctx.page.keyboard.type(step.text, { delay: ctx.pacing.typeDelayMs });
  events.push(
    buildEvent({
      action: "type",
      startTime: start,
      selector: step.selector,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.page.waitForTimeout(step.delay ?? ctx.pacing.postTypeDelayMs);
};

const handleHover: ActionHandler = async (ctx, step, events) => {
  const start = Date.now();
  if (step.action !== "hover") return;
  const box = await getBoundingBox(ctx.page, step.selector);
  await ctx.moveCursorTo(box);
  await ctx.page.hover(step.selector);
  events.push(
    buildEvent({
      action: "hover",
      startTime: start,
      selector: step.selector,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.page.waitForTimeout(step.delay ?? ctx.pacing.postClickDelayMs);
};

const handleScroll: ActionHandler = async (ctx, step, events) => {
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
  await ctx.page.waitForTimeout(step.delay ?? ctx.pacing.postClickDelayMs);
};

const handleWait: ActionHandler = async (ctx, step, events) => {
  const start = Date.now();
  if (step.action !== "wait") return;
  await ctx.page.waitForTimeout(step.timeout);
  events.push(buildEvent({ action: "wait", startTime: start, narration: step.narration }));
};

const handleAssert: ActionHandler = async (ctx, step, events) => {
  const start = Date.now();
  if (step.action !== "assert") return;
  const locator = ctx.page.locator(step.selector);
  if (step.visible !== undefined) {
    const isVisible = await locator.isVisible();
    if (isVisible !== step.visible) {
      throw new Error(`Assertion failed: ${step.selector} visibility is ${String(isVisible)}`);
    }
  }
  if (step.text !== undefined) {
    const content = await locator.textContent();
    if (!content?.includes(step.text)) {
      throw new Error(`Assertion failed: "${step.text}" not found in ${step.selector}`);
    }
  }
  events.push(
    buildEvent({
      action: "assert",
      startTime: start,
      selector: step.selector,
      narration: step.narration,
    }),
  );
};

const handleScreenshot: ActionHandler = async (ctx, step, events) => {
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
};

const handlePress: ActionHandler = async (ctx, step, events) => {
  const start = Date.now();
  if (step.action !== "press") return;
  await ctx.page.keyboard.press(step.key);
  events.push(buildEvent({ action: "press", startTime: start, narration: step.narration }));
  await ctx.page.waitForTimeout(step.delay ?? ctx.pacing.postClickDelayMs);
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
