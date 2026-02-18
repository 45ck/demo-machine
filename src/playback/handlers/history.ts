import type { ActionHandler } from "../action-core.js";
import { buildEvent, stepTimeoutMs } from "../action-core.js";
import { selectorForEvent } from "../selector.js";

export const handleBack: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "back") return;

  const timeoutMs = stepTimeoutMs(step);
  await ctx.page.goBack({ timeout: timeoutMs });

  events.push(
    buildEvent({
      action: "back",
      startTime: start,
      selector: selectorForEvent(step),
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};

export const handleForward: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "forward") return;

  const timeoutMs = stepTimeoutMs(step);
  await ctx.page.goForward({ timeout: timeoutMs });

  events.push(
    buildEvent({
      action: "forward",
      startTime: start,
      selector: selectorForEvent(step),
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};
