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

function checkSteps(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const spec = ctx.spec as Record<string, unknown>;
  const chapters = (spec.chapters ?? []) as Array<Record<string, unknown>>;
  const runner = spec.runner as Record<string, unknown> | undefined;
  const name = "spec-steps";

  let stepIndex = 0;
  let hasNavigate = false;

  for (const chapter of chapters) {
    const steps = (chapter.steps ?? []) as Array<Record<string, unknown>>;
    for (const step of steps) {
      const action = step.action as string;

      if (!KNOWN_ACTIONS.has(action)) {
        results.push(
          fail(
            name,
            `Step ${stepIndex}: unknown action "${action}"`,
            `Known actions: ${[...KNOWN_ACTIONS].join(", ")}`,
          ),
        );
      }

      if (action === "navigate") {
        hasNavigate = true;
      }

      // Warn on assert steps with very high timeouts
      if (action === "assert") {
        if (typeof step.timeoutMs === "number" && step.timeoutMs > 30000) {
          results.push(
            warn(name, `Step ${stepIndex}: assert timeout ${step.timeoutMs}ms is very high`),
          );
        }
      }

      // Warn on wait steps with very long timeouts
      if (action === "wait") {
        if (typeof step.timeout === "number" && step.timeout > 30000) {
          results.push(
            warn(name, `Step ${stepIndex}: wait timeout ${step.timeout}ms is very long`),
          );
        }
      }

      stepIndex++;
    }
  }

  // Warn if no navigate step found (likely needs a URL)
  if (!hasNavigate && !runner?.url) {
    results.push(
      warn(name, "No navigate step found and no runner.url configured"),
    );
  }

  if (results.length === 0) {
    return [pass(name)];
  }
  return results;
}

registerCheck({
  name: "spec-steps",
  phase: "pre-capture",
  fn: checkSteps,
});
