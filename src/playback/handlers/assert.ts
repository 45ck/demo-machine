import type { ActionHandler } from "../action-core.js";
import { buildEvent, stepTimeoutMs } from "../action-core.js";
import { resolveStepLocator } from "../selector.js";
import { flashSpotlight, pulseFocus } from "../visuals.js";

export const handleAssert: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "assert") return;

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  if (step.visible !== undefined) {
    await locator.waitFor({
      state: step.visible ? "visible" : "hidden",
      timeout: timeoutMs,
    });
  }

  if (step.text !== undefined) {
    const deadline = Date.now() + timeoutMs;
    let content: string | null = null;
    while (Date.now() <= deadline) {
      content = await locator.textContent();
      if (content?.includes(step.text)) break;
      await ctx.page.waitForTimeout(200);
    }
    if (!content?.includes(step.text)) {
      throw new Error(`Assertion failed: "${step.text}" not found in ${resolved.selectorForEvent}`);
    }
  }

  const box = await locator.boundingBox();
  await flashSpotlight(ctx.page, box);
  await pulseFocus(ctx.page, box);

  events.push(
    buildEvent({
      action: "assert",
      startTime: start,
      selector: resolved.selectorForEvent,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};
