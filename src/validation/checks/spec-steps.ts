import { registerCheck } from "../registry.js";
import { pass, fail, warn } from "../types.js";
import type { CheckContext, CheckResult } from "../types.js";

const KNOWN_ACTIONS = new Set([
  "navigate",
  "click",
  "clickFirstVisible",
  "type",
  "hover",
  "scroll",
  "wait",
  "assert",
  "screenshot",
  "press",
  "back",
  "forward",
  "check",
  "uncheck",
  "select",
  "selectFirstNonPlaceholder",
  "upload",
  "dragAndDrop",
]);

export { KNOWN_ACTIONS };

interface StepsSpecShape {
  chapters?: Array<{
    steps?: Array<{
      action?: string;
      timeoutMs?: number;
      timeout?: number;
    }>;
  }>;
  runner?: { url?: string };
}

const CHECK_NAME = "spec-steps";
const HIGH_TIMEOUT = 30000;

function checkStepAction(
  step: { action?: string; timeoutMs?: number; timeout?: number },
  stepIndex: number,
  results: CheckResult[],
): void {
  const action = step.action as string;

  if (!KNOWN_ACTIONS.has(action)) {
    results.push(
      fail(
        CHECK_NAME,
        `Step ${stepIndex}: unknown action "${action}"`,
        `Known actions: ${[...KNOWN_ACTIONS].join(", ")}`,
      ),
    );
  }

  if (action === "assert" && typeof step.timeoutMs === "number" && step.timeoutMs > HIGH_TIMEOUT) {
    results.push(
      warn(CHECK_NAME, `Step ${stepIndex}: assert timeout ${step.timeoutMs}ms is very high`),
    );
  }

  if (action === "wait" && typeof step.timeout === "number" && step.timeout > HIGH_TIMEOUT) {
    results.push(
      warn(CHECK_NAME, `Step ${stepIndex}: wait timeout ${step.timeout}ms is very long`),
    );
  }
}

function checkSteps(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const spec = ctx.spec as StepsSpecShape;
  const chapters = spec.chapters ?? [];

  let stepIndex = 0;
  let hasNavigate = false;

  for (const chapter of chapters) {
    for (const step of chapter.steps ?? []) {
      checkStepAction(step, stepIndex, results);
      if (step.action === "navigate") hasNavigate = true;
      stepIndex++;
    }
  }

  if (!hasNavigate && !spec.runner?.url) {
    results.push(warn(CHECK_NAME, "No navigate step found and no runner.url configured"));
  }

  return results.length === 0 ? [pass(CHECK_NAME)] : results;
}

registerCheck({
  name: "spec-steps",
  phase: "pre-capture",
  fn: checkSteps,
});
