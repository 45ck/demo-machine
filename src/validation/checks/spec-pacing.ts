import { registerCheck } from "../registry.js";
import { pass, fail } from "../types.js";
import type { CheckContext, CheckResult } from "../types.js";

const PACING_FIELDS = [
  "cursorDurationMs",
  "typeDelayMs",
  "postClickDelayMs",
  "postTypeDelayMs",
  "postNavigateDelayMs",
  "settleDelayMs",
] as const;

function checkPacing(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const spec = ctx.spec as Record<string, unknown>;
  const pacing = spec.pacing as Record<string, unknown> | undefined;
  const name = "spec-pacing";

  if (!pacing) {
    return [pass(name)];
  }

  for (const field of PACING_FIELDS) {
    const value = pacing[field];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      results.push(
        fail(name, `pacing.${field} must be a non-negative number, got ${String(value)}`),
      );
    }
  }

  if (results.length === 0) {
    return [pass(name)];
  }
  return results;
}

registerCheck({
  name: "spec-pacing",
  phase: "pre-capture",
  fn: checkPacing,
});
