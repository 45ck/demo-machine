import type { CheckContext } from "./types.js";
import { PreflightError } from "./errors.js";
import { runPhase } from "./registry.js";

export async function preflight(ctx: CheckContext): Promise<void> {
  const results = await runPhase("pre-capture", ctx);
  const failures = results.filter((r) => r.status === "fail");
  if (failures.length > 0) {
    throw new PreflightError(failures);
  }
}

export { PreflightError } from "./errors.js";
