import { registerCheck } from "../registry.js";
import { pass, warn } from "../types.js";
import type { CheckContext, CheckResult } from "../types.js";

const MAX_NARRATION_LENGTH = 500;
const MIN_NARRATION_LENGTH = 5;

function checkNarrationTiming(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const spec = ctx.spec as Record<string, unknown>;
  const opts = ctx.options ?? {};
  const name = "narration-timing";

  if (!opts.narration) {
    return [pass(name)];
  }

  const chapters = (spec.chapters ?? []) as Array<Record<string, unknown>>;
  let stepIndex = 0;
  for (const chapter of chapters) {
    const steps = (chapter.steps ?? []) as Array<Record<string, unknown>>;
    for (const step of steps) {
      if (typeof step.narration === "string") {
        if (step.narration.length > MAX_NARRATION_LENGTH) {
          results.push(
            warn(
              name,
              `Step ${stepIndex}: narration text is ${step.narration.length} chars (max recommended: ${MAX_NARRATION_LENGTH})`,
            ),
          );
        }
        if (step.narration.trim().length < MIN_NARRATION_LENGTH) {
          results.push(
            warn(
              name,
              `Step ${stepIndex}: narration text is very short (${step.narration.trim().length} chars)`,
            ),
          );
        }
      }
      stepIndex++;
    }
  }

  if (results.length === 0) {
    return [pass(name)];
  }
  return results;
}

registerCheck({
  name: "narration-timing",
  phase: "pre-capture",
  fn: checkNarrationTiming,
});
