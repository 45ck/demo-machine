import type { ActionHandler } from "../action-core.js";
import { buildEvent, ensureTargetReady, stepTimeoutMs } from "../action-core.js";
import { resolveLocatorFromInput, type Target } from "../selector.js";
import { flashSpotlight, pulseFocus } from "../visuals.js";

export const handleDragAndDrop: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "dragAndDrop") return;

  const timeoutMs = stepTimeoutMs(step);

  const fromResolved = resolveLocatorFromInput(
    ctx.page,
    {
      selector: step.from.selector,
      target: step.from.target as unknown as Target,
      nth: step.from.nth,
    },
    'Step "dragAndDrop.from"',
  );
  const toResolved = resolveLocatorFromInput(
    ctx.page,
    {
      selector: step.to.selector,
      target: step.to.target as unknown as Target,
      nth: step.to.nth,
    },
    'Step "dragAndDrop.to"',
  );

  await ensureTargetReady(fromResolved.locator, timeoutMs);
  await ensureTargetReady(toResolved.locator, timeoutMs);

  const fromBox = await fromResolved.locator.boundingBox();
  await ctx.moveCursorTo(fromBox);
  await flashSpotlight(ctx.page, fromBox);
  await pulseFocus(ctx.page, fromBox);

  await fromResolved.locator.dragTo(toResolved.locator, { timeout: timeoutMs });

  events.push(
    buildEvent({
      action: "dragAndDrop",
      startTime: start,
      selector: `${fromResolved.selectorForEvent} -> ${toResolved.selectorForEvent}`,
      boundingBox: fromBox,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};
