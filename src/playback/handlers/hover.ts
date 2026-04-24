import type { ActionHandler } from "../action-core.js";
import { buildEvent, ensureTargetReady, stepTimeoutMs } from "../action-core.js";
import { resolveStepLocator } from "../selector.js";
import { flashSpotlight, pulseFocus } from "../visuals.js";
import { checkPointerEvents, checkBoundingBoxStability, checkNetworkIdle } from "../guards.js";

export const handleHover: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "hover") return;

  // Runtime guard — warn about pending network requests before action.
  await checkNetworkIdle(ctx.page);

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();

  // Runtime guards — warn but never block.
  await checkBoundingBoxStability(locator);
  if (step.selector) {
    await checkPointerEvents(ctx.page, step.selector, locator);
  }

  await ctx.moveCursorTo(box);
  await flashSpotlight(ctx.page, box);
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
