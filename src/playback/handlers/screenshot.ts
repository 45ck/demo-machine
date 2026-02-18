import type { ActionHandler } from "../action-core.js";
import { buildEvent } from "../action-core.js";

export const handleScreenshot: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "screenshot") return;

  let options: { path?: string } | undefined;
  if (step.name) {
    if (/[/\\]/.test(step.name)) {
      throw new Error(`Invalid screenshot name (path separators not allowed): ${step.name}`);
    }
    options = { path: step.name };
  }

  await ctx.page.screenshot(options);
  events.push(buildEvent({ action: "screenshot", startTime: start, narration: step.narration }));
  await ctx.waitAfterStep(stepIndex, step);
};
