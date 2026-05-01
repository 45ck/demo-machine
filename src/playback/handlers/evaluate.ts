import type { ActionHandler } from "../action-core.js";
import { buildEvent, stepTimeoutMs } from "../action-core.js";

function resolveArg(step: Extract<Parameters<ActionHandler>[1], { action: "evaluate" }>): unknown {
  if (step.argFromEnv === undefined) return step.arg;

  const value = process.env[step.argFromEnv];
  if (value === undefined) {
    throw new Error(`evaluate argFromEnv "${step.argFromEnv}" was not set`);
  }
  return value;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`evaluate timed out after ${String(timeoutMs)}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export const handleEvaluate: ActionHandler = async (ctx, step, events, stepIndex) => {
  if (step.action !== "evaluate") return;

  const start = Date.now();
  const arg = resolveArg(step);
  const timeoutMs = stepTimeoutMs(step);
  const argName = "__demoMachineEvaluateArg";
  const script = `(() => {
const arg = globalThis.${argName};
${step.expression}
})()`;

  try {
    await ctx.page.evaluate((payload: unknown) => {
      (globalThis as Record<string, unknown>)["__demoMachineEvaluateArg"] = payload;
    }, arg);
    await withTimeout(ctx.page.evaluate(script), timeoutMs);
  } finally {
    await ctx.page
      .evaluate(() => {
        delete (globalThis as Record<string, unknown>)["__demoMachineEvaluateArg"];
      })
      .catch(() => undefined);
  }

  events.push(
    buildEvent({
      action: "evaluate",
      startTime: start,
      selector: step.label ?? "evaluate",
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};
