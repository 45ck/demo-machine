import type { ActionHandler } from "../action-core.js";
import { buildEvent, stepTimeoutMs } from "../action-core.js";

export const handleNavigate: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "navigate") return;

  const waitUntil = (step as unknown as { waitUntil?: unknown }).waitUntil;
  const timeoutMs = stepTimeoutMs(step);
  const url = new URL(step.url, ctx.baseUrl).toString();

  await ctx.page.goto(url, {
    waitUntil:
      waitUntil === "load" || waitUntil === "domcontentloaded" || waitUntil === "networkidle"
        ? waitUntil
        : "domcontentloaded",
    timeout: timeoutMs,
  });
  await ctx.reinjectCursor();

  events.push(buildEvent({ action: "navigate", startTime: start, narration: step.narration }));
  await ctx.waitAfterStep(stepIndex, step);
};
