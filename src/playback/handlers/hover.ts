import type { ActionHandler } from "../action-core.js";
import { buildEvent, ensureTargetReady, stepTimeoutMs } from "../action-core.js";
import { resolveStepLocator } from "../selector.js";
import { flashSpotlight, pulseFocus } from "../visuals.js";
import { checkPointerEvents } from "../guards.js";

export const handleHover: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "hover") return;

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();

  // Runtime guard — warn but never block.
  if (step.selector) {
    await checkPointerEvents(ctx.page, step.selector);
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
