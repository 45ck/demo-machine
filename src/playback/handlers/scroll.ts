import type { ActionHandler, PlaybackContext } from "../action-core.js";
import { buildEvent, ensureTargetAttached, stepTimeoutMs } from "../action-core.js";
import { resolveLocatorFromInput, resolveStepLocator } from "../selector.js";
import { flashSpotlight, pulseFocus } from "../visuals.js";
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

export const handleScroll: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "scroll") return;

  const timeoutMs = stepTimeoutMs(step);
  const hasTarget = (step as unknown as { target?: unknown }).target !== undefined;
  const hasSelector = typeof step.selector === "string" && step.selector.length > 0;

  if (hasSelector || hasTarget) {
    const { selectorForEvent, box } = await scrollElement(ctx, step, timeoutMs);
    events.push(
      buildEvent({
        action: "scroll",
        startTime: start,
        selector: selectorForEvent,
        boundingBox: box ?? undefined,
        narration: step.narration,
      }),
    );
  } else {
    await ctx.page.evaluate(
      (({ x, y }: { x: number; y: number }) => {
        window.scrollBy({ left: x, top: y, behavior: "smooth" });
      }) as (...args: unknown[]) => unknown,
      { x: step.x ?? 0, y: step.y ?? 0 } as unknown,
    );
    events.push(buildEvent({ action: "scroll", startTime: start, narration: step.narration }));
  }

  await ctx.waitAfterStep(stepIndex, step);
};
