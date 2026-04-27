import type { ActionHandler } from "../action-core.js";
import { buildEvent, stepTimeoutMs } from "../action-core.js";

export const handleWaitForPageFunction: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "waitForPageFunction") return;

  const timeoutMs = stepTimeoutMs(step);
  const polling = step.pollingMs ?? 500;
  await ctx.page.waitForFunction(step.expression, undefined, {
    timeout: timeoutMs,
    polling,
  });

  events.push(
    buildEvent({
      action: "waitForPageFunction",
      startTime: start,
      selector: step.label ?? step.expression,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};
