import type { ActionHandler } from "../action-core.js";
import { buildEvent } from "../action-core.js";
import { selectorForEvent } from "../selector.js";

export const handlePress: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "press") return;

  await ctx.page.keyboard.press(step.key);
  events.push(
    buildEvent({
      action: "press",
      startTime: start,
      selector: selectorForEvent(step),
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};
