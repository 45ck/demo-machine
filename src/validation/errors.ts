import type { CheckResult } from "./types.js";

export class PreflightError extends Error {
  public readonly failures: CheckResult[];
  constructor(failures: CheckResult[]) {
    const lines = failures.map(
      (f) => `  ✗ [${f.checkName}] ${f.message}${f.suggestion ? `\n    → ${f.suggestion}` : ""}`,
    );
    super(`Preflight validation failed:\n${lines.join("\n")}`);
    this.name = "PreflightError";
    this.failures = failures;
  }
}
