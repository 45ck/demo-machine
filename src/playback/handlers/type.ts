import type { ActionHandler } from "../action-core.js";
import { buildEvent, ensureTargetReady, stepTimeoutMs } from "../action-core.js";
import { resolveStepLocator } from "../selector.js";
import { flashSpotlight, pulseFocus } from "../visuals.js";
import { checkTypedText, checkNetworkIdle } from "../guards.js";
import { checkActionability, checkSemanticFormTarget } from "../a11y-guards.js";

export const handleType: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "type") return;

  // Runtime guard — warn about pending network requests before action.
  await checkNetworkIdle(ctx.page);

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();

  // Runtime guards — warn but never block.
  if (step.selector) {
    await checkActionability(ctx.page, step.selector, "type");
    await checkSemanticFormTarget(ctx.page, step.selector, "type");
  }

  await ctx.moveCursorTo(box);
  await flashSpotlight(ctx.page, box);
  await pulseFocus(ctx.page, box);

  const clear = (step as unknown as { clear?: unknown }).clear;
  if (clear === true) {
    try {
      await locator.fill("", { timeout: timeoutMs });
    } catch (err) {
      throw new Error(
        `type action failed to clear "${resolved.selectorForEvent}" before typing: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }

  await locator.click({ timeout: timeoutMs });
  await ctx.page.keyboard.type(step.text, { delay: ctx.pacing.typeDelayMs });

  // Runtime guard — readback check, warn but never block.
  // Only verify readback when we cleared first — append mode makes strict comparison unreliable.
  if (clear === true && step.selector) {
    await checkTypedText(ctx.page, step.selector, step.text);
  }

  events.push(
    buildEvent({
      action: "type",
      startTime: start,
      selector: resolved.selectorForEvent,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};
