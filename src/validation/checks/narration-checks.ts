import { registerCheck } from "../registry.js";
import { pass, warn } from "../types.js";
import type { CheckContext, CheckResult } from "../types.js";

const MAX_NARRATION_LENGTH = 500;
const MIN_NARRATION_LENGTH = 5;
const CHECK_NAME = "narration-timing";

interface NarrationSpec {
  chapters?: Array<{ steps?: Array<{ narration?: string }> }>;
}

interface NarrationOptions {
  narration?: boolean;
}

function checkStepNarration(text: string, stepIndex: number, results: CheckResult[]): void {
  if (text.length > MAX_NARRATION_LENGTH) {
    results.push(
      warn(
        CHECK_NAME,
        `Step ${stepIndex}: narration text is ${text.length} chars (max recommended: ${MAX_NARRATION_LENGTH})`,
      ),
    );
  }
  if (text.trim().length < MIN_NARRATION_LENGTH) {
    results.push(
      warn(
        CHECK_NAME,
        `Step ${stepIndex}: narration text is very short (${text.trim().length} chars)`,
      ),
    );
  }
}

function checkNarrationTiming(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const spec = ctx.spec as NarrationSpec;
  const opts = (ctx["options"] ?? {}) as NarrationOptions;

  if (!opts.narration) {
    return [pass(CHECK_NAME)];
  }

  const chapters = spec.chapters ?? [];
  let stepIndex = 0;
  for (const chapter of chapters) {
    const steps = chapter.steps ?? [];
    for (const step of steps) {
      if (typeof step.narration === "string") {
        checkStepNarration(step.narration, stepIndex, results);
      }
      stepIndex++;
    }
  }

  return results.length === 0 ? [pass(CHECK_NAME)] : results;
}

registerCheck({
  name: "narration-timing",
  phase: "pre-capture",
  fn: checkNarrationTiming,
});
