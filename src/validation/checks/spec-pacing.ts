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

type PacingField = (typeof PACING_FIELDS)[number];
type PacingShape = Partial<Record<PacingField, unknown>>;

interface SpecWithPacing {
  pacing?: PacingShape;
}

function checkPacing(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const spec = ctx.spec as SpecWithPacing;
  const pacing = spec.pacing;
  const name = "spec-pacing";

  if (!pacing) {
    return [pass(name)];
  }

  for (const field of PACING_FIELDS) {
    const value: unknown = pacing[field];
    if (
      value !== undefined &&
      (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    ) {
      results.push(
        fail(name, `pacing.${field} must be a non-negative number, got ${JSON.stringify(value)}`),
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
