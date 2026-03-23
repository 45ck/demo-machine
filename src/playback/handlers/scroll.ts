import type { ActionHandler, PlaybackContext } from "../action-core.js";
import { buildEvent, ensureTargetAttached, stepTimeoutMs } from "../action-core.js";
import { resolveLocatorFromInput, resolveStepLocator } from "../selector.js";
import { flashSpotlight, pulseFocus } from "../visuals.js";
import { checkScrollPosition, checkNetworkIdle } from "../guards.js";
import type { Chapter } from "../../spec/types.js";

type ScrollStep = Extract<Chapter["steps"][number], { action: "scroll" }>;

async function scrollElement(
  ctx: PlaybackContext,
  step: ScrollStep,
  timeoutMs: number,
): Promise<{
  selectorForEvent: string;
  box: Awaited<ReturnType<import("../playwright.js").PlaywrightLocator["boundingBox"]>>;
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
  await flashSpotlight(ctx.page, box);
  await pulseFocus(ctx.page, box);

  await locator.evaluate(
    ((el: unknown, delta: { x: number; y: number }) => {
      const node = el as HTMLElement;
      node.scrollBy({ left: delta.x, top: delta.y, behavior: "smooth" });
    }) as (...args: unknown[]) => unknown,
    { x: step.x ?? 0, y: step.y ?? 0 } as unknown,
  );

  return { selectorForEvent: resolved.selectorForEvent, box };
}

async function handleElementScroll(
  ctx: PlaybackContext,
  step: ScrollStep,
  start: number,
  events: Parameters<ActionHandler>[2],
): Promise<void> {
  const timeoutMs = stepTimeoutMs(step);
  const { selectorForEvent, box } = await scrollElement(ctx, step, timeoutMs);
  await checkScrollPosition(ctx.page, step.selector, step.x ?? 0, step.y ?? 0);
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
  await ctx.page.evaluate(
    (({ x, y }: { x: number; y: number }) => {
      window.scrollBy({ left: x, top: y, behavior: "smooth" });
    }) as (...args: unknown[]) => unknown,
    { x: sx, y: sy } as unknown,
  );
  await checkScrollPosition(ctx.page, undefined, sx, sy);
  events.push(buildEvent({ action: "scroll", startTime: start, narration: step.narration }));
}

export const handleScroll: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "scroll") return;

  await checkNetworkIdle(ctx.page);

  const hasTarget = (step as unknown as { target?: unknown }).target !== undefined;
  const hasSelector = typeof step.selector === "string" && step.selector.length > 0;

  if (hasSelector || hasTarget) {
    await handleElementScroll(ctx, step, start, events);
  } else {
    await handleWindowScroll(ctx, step, start, events);
  }

  await ctx.waitAfterStep(stepIndex, step);
};
