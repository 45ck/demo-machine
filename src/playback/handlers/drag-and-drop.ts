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
  const toBox = await toResolved.locator.boundingBox();

  await ctx.moveCursorTo(fromBox);
  await flashSpotlight(ctx.page, fromBox);
  await pulseFocus(ctx.page, fromBox);

  // Animate cursor toward destination concurrently with the drag so it appears
  // to carry the element rather than teleporting after the drop completes.
  await Promise.all([
    ctx.moveCursorTo(toBox),
    fromResolved.locator
      .dragTo(toResolved.locator, { timeout: timeoutMs })
      .catch((err: unknown) => {
        throw new Error(
          `dragAndDrop failed from "${fromResolved.selectorForEvent}" to "${toResolved.selectorForEvent}": ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }),
  ]);

  await flashSpotlight(ctx.page, toBox);
  await pulseFocus(ctx.page, toBox);

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
