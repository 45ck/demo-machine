import type { ActionHandler } from "../action-core.js";
import { buildEvent, ensureTargetReady, stepTimeoutMs } from "../action-core.js";
import { resolveStepLocator } from "../selector.js";
import { getClickPulseScript } from "../cursor.js";
import { flashSpotlight, pulseFocus, spawnRipple } from "../visuals.js";

export const handleClick: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "click") return;

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();
  await ctx.moveCursorTo(box);
  await flashSpotlight(ctx.page, box);
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
