import type { ActionHandler, PlaybackContext } from "../action-core.js";
import { buildEvent, ensureTargetAttached, stepTimeoutMs } from "../action-core.js";
import { resolveLocatorFromInput, resolveStepLocator } from "../selector.js";
import { flashSpotlight, pulseFocus } from "../visuals.js";
import {
  checkElementScrollPosition,
  checkNetworkIdle,
  checkWindowScrollPosition,
  readElementScrollPosition,
  readWindowScrollPosition,
} from "../guards.js";
import type { Chapter } from "../../spec/types.js";
import type { ElementScrollPosition } from "../guards.js";
import type { PlaywrightLocator } from "../playwright.js";

type ScrollStep = Extract<Chapter["steps"][number], { action: "scroll" }>;
type ScrollEvents = Parameters<ActionHandler>[2];
type ElementScrollRequest = {
  ctx: PlaybackContext;
  step: ScrollStep;
  start: number;
  events: ScrollEvents;
  stepIndex: number;
};
const SCROLL_SETTLE_INTERVAL_MS = 75;
const SCROLL_SETTLE_TIMEOUT_MS = 1500;

async function scrollElement(
  ctx: PlaybackContext,
  step: ScrollStep,
  timeoutMs: number,
  stepIndex: number,
): Promise<{
  selectorForEvent: string;
  box: Awaited<ReturnType<import("../playwright.js").PlaywrightLocator["boundingBox"]>>;
  locator: PlaywrightLocator;
  beforeScroll: ElementScrollPosition | null;
}> {
  const hasSelector = typeof step.selector === "string" && step.selector.length > 0;
  const resolved = hasSelector
    ? resolveLocatorFromInput(
        ctx.page,
        { selector: step.selector!, nth: step.nth },
        'Step "scroll"',
      )
    : resolveStepLocator(ctx.page, step);

  const locator = resolved.locator;
  await ensureTargetAttached(locator, timeoutMs);
  await locator.scrollIntoViewIfNeeded({ timeout: timeoutMs });

  const box = await locator.boundingBox();
  await ctx.moveCursorTo(box);
  if (ctx.shouldShowActionFocusVisuals?.(stepIndex, step) ?? true) {
    await flashSpotlight(ctx.page, box);
    await pulseFocus(ctx.page, box);
  }

  const beforeScroll = await readElementScrollPosition(locator);
  await locator.evaluate(
    ((el: unknown, delta: { x: number; y: number }) => {
      const node = el as HTMLElement;
      node.scrollBy({ left: delta.x, top: delta.y, behavior: "smooth" });
    }) as (...args: unknown[]) => unknown,
    { x: step.x ?? 0, y: step.y ?? 0 } as unknown,
  );
  await waitForScrollSettled(ctx, () => readElementScrollPosition(locator));

  return { selectorForEvent: resolved.selectorForEvent, box, locator, beforeScroll };
}

async function handleElementScroll({
  ctx,
  step,
  start,
  events,
  stepIndex,
}: ElementScrollRequest): Promise<void> {
  const timeoutMs = stepTimeoutMs(step);
  const { selectorForEvent, box, locator, beforeScroll } = await scrollElement(
    ctx,
    step,
    timeoutMs,
    stepIndex,
  );
  await checkElementScrollPosition({
    locator,
    selector: selectorForEvent,
    requestedX: step.x ?? 0,
    requestedY: step.y ?? 0,
    before: beforeScroll,
  });
  events.push(
    buildEvent({
      action: "scroll",
      startTime: start,
      selector: selectorForEvent,
      boundingBox: box ?? undefined,
      narration: step.narration,
    }),
  );
}

async function handleWindowScroll(
  ctx: PlaybackContext,
  step: ScrollStep,
  start: number,
  events: Parameters<ActionHandler>[2],
): Promise<void> {
  const sx = step.x ?? 0;
  const sy = step.y ?? 0;
  const beforeScroll = await readWindowScrollPosition(ctx.page);
  await ctx.page.evaluate(
    (({ x, y }: { x: number; y: number }) => {
      window.scrollBy({ left: x, top: y, behavior: "smooth" });
    }) as (...args: unknown[]) => unknown,
    { x: sx, y: sy } as unknown,
  );
  await waitForScrollSettled(ctx, () => readWindowScrollPosition(ctx.page));
  await checkWindowScrollPosition({
    page: ctx.page,
    requestedX: sx,
    requestedY: sy,
    before: beforeScroll,
  });
  events.push(buildEvent({ action: "scroll", startTime: start, narration: step.narration }));
}

async function waitForScrollSettled<
  T extends ElementScrollPosition | { scrollX: number; scrollY: number },
>(ctx: PlaybackContext, readPosition: () => Promise<T | null>): Promise<void> {
  let previous = await readPosition();
  let stableReads = 0;
  const deadline = Date.now() + SCROLL_SETTLE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await ctx.page.waitForTimeout(SCROLL_SETTLE_INTERVAL_MS);
    const current = await readPosition();
    if (!previous || !current) return;
    if (sameScrollPosition(previous, current)) {
      stableReads += 1;
      if (stableReads >= 2) return;
    } else {
      stableReads = 0;
    }
    previous = current;
  }
}

function sameScrollPosition(
  a: ElementScrollPosition | { scrollX: number; scrollY: number },
  b: ElementScrollPosition | { scrollX: number; scrollY: number },
): boolean {
  if ("scrollLeft" in a && "scrollLeft" in b) {
    return a.scrollLeft === b.scrollLeft && a.scrollTop === b.scrollTop;
  }
  if ("scrollX" in a && "scrollX" in b) {
    return a.scrollX === b.scrollX && a.scrollY === b.scrollY;
  }
  return false;
}

export const handleScroll: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "scroll") return;

  await checkNetworkIdle(ctx.page);

  const hasTarget = (step as unknown as { target?: unknown }).target !== undefined;
  const hasSelector = typeof step.selector === "string" && step.selector.length > 0;

  if (hasSelector || hasTarget) {
    await handleElementScroll({ ctx, step, start, events, stepIndex });
  } else {
    await handleWindowScroll(ctx, step, start, events);
  }

  await ctx.waitAfterStep(stepIndex, step);
};
