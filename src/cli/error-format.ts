import { SpecLoadError } from "../spec/loader.js";
import { PreflightError } from "../validation/errors.js";

interface FormatCliErrorOptions {
  verbose?: boolean | undefined;
}

function formatPreflightError(error: PreflightError): string {
  const lines = ["Preflight validation failed"];
  for (const failure of error.failures) {
    lines.push(`- [${failure.checkName}] ${failure.message}`);
    if (failure.suggestion) {
      lines.push(`  Suggestion: ${failure.suggestion}`);
    }
  }
  return lines.join("\n");
}

export function formatCliError(error: unknown, opts: FormatCliErrorOptions = {}): string {
  if (opts.verbose && error instanceof Error && error.stack) {
    return error.stack;
  }

  if (error instanceof PreflightError) {
    return formatPreflightError(error);
  }

  if (error instanceof SpecLoadError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
