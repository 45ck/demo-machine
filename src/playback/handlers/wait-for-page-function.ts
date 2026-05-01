import type { ActionHandler } from "../action-core.js";
import { buildEvent, stepTimeoutMs } from "../action-core.js";

function toRunnableExpression(expression: string): string {
  const trimmed = expression.trim();
  if (
    /^(async\s+)?function\b/.test(trimmed) ||
    /^(async\s*)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(trimmed)
  ) {
    return `(${trimmed})()`;
  }
  return trimmed;
}

export const handleWaitForPageFunction: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "waitForPageFunction") return;

  const timeoutMs = stepTimeoutMs(step);
  const polling = step.pollingMs ?? 500;
  await ctx.page.waitForFunction(toRunnableExpression(step.expression), undefined, {
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
