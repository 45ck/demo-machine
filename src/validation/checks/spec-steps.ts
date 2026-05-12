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
  "waitForLocalDirectoryStable",
  "waitForLocalFile",
  "waitForPageFunction",
  "evaluate",
  "runCommand",
  "assert",
  "requireState",
  "screenshot",
  "press",
  "back",
  "forward",
  "check",
  "uncheck",
  "select",
  "selectOptionInListbox",
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

const TIMEOUT_WARNINGS = [
  { action: "assert", field: "timeoutMs", message: "assert timeout {value}ms is very high" },
  { action: "wait", field: "timeout", message: "wait timeout {value}ms is very long" },
  {
    action: "waitForLocalDirectoryStable",
    field: "timeoutMs",
    message: "waitForLocalDirectoryStable timeout {value}ms is very high",
  },
  {
    action: "waitForLocalFile",
    field: "timeoutMs",
    message: "waitForLocalFile timeout {value}ms is very high",
  },
  {
    action: "waitForPageFunction",
    field: "timeoutMs",
    message: "waitForPageFunction timeout {value}ms is very high",
  },
  {
    action: "evaluate",
    field: "timeoutMs",
    message: "evaluate timeout {value}ms is very high",
  },
  {
    action: "runCommand",
    field: "timeoutMs",
    message: "runCommand timeout {value}ms is very high",
  },
] as const;

function pushUnknownActionResult(action: string, stepIndex: number, results: CheckResult[]): void {
  if (KNOWN_ACTIONS.has(action)) return;
  results.push(
    fail(
      CHECK_NAME,
      `Step ${stepIndex}: unknown action "${action}"`,
      `Known actions: ${[...KNOWN_ACTIONS].join(", ")}`,
    ),
  );
}

function pushTimeoutWarning(
  step: { action?: string; timeoutMs?: number; timeout?: number },
  stepIndex: number,
  results: CheckResult[],
): void {
  const warning = TIMEOUT_WARNINGS.find((candidate) => candidate.action === step.action);
  if (!warning) return;

  const value = step[warning.field];
  if (typeof value !== "number" || value <= HIGH_TIMEOUT) return;

  results.push(
    warn(CHECK_NAME, `Step ${stepIndex}: ${warning.message.replace("{value}", String(value))}`),
  );
}

function checkStepAction(
  step: { action?: string; timeoutMs?: number; timeout?: number },
  stepIndex: number,
  results: CheckResult[],
): void {
  const action = step.action as string;

  pushUnknownActionResult(action, stepIndex, results);
  pushTimeoutWarning(step, stepIndex, results);
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
