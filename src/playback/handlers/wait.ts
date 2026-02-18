import type { ActionHandler } from "../action-core.js";
import { buildEvent } from "../action-core.js";

export const handleWait: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "wait") return;

  await ctx.page.waitForTimeout(step.timeout);
  events.push(buildEvent({ action: "wait", startTime: start, narration: step.narration }));
  await ctx.waitAfterStep(stepIndex, step);
};
