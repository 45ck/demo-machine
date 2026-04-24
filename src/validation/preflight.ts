import type { CheckContext } from "./types.js";
import { PreflightError } from "./errors.js";
import { runPhase } from "./registry.js";

// Side-effect imports: register pre-capture checks
import "./checks/action-conflicts.js";
import "./checks/narration-checks.js";
import "./checks/pre-capture.js";
import "./checks/spec-chapters.js";
import "./checks/spec-files.js";
import "./checks/spec-narration.js";
import "./checks/spec-pacing.js";
import "./checks/spec-selectors.js";
import "./checks/spec-steps.js";

export async function preflight(ctx: CheckContext): Promise<void> {
  const results = await Promise.resolve(runPhase("pre-capture", ctx));
  const failures = results.filter((r) => r.status === "fail");
  if (failures.length > 0) {
    throw new PreflightError(failures);
  }
}

export { PreflightError } from "./errors.js";
