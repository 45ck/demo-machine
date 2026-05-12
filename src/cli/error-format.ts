import { PlaybackStepError } from "../playback/errors.js";
import { SpecLoadError } from "../spec/loader.js";
import { PreflightError } from "../validation/errors.js";
import { OutputCollisionError } from "./output.js";

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

/**
 * Surface the underlying cause's message for PlaybackStepError. The
 * one-line wrapper message is useful as a header but the cause contains
 * the rich diagnostic (e.g. requireState's DATA DRIFT banner) — losing
 * it would defeat the whole point of the precondition step.
 */
function formatPlaybackStepError(error: PlaybackStepError): string {
  const cause = (error as unknown as { cause?: unknown }).cause;
  const causeMessage =
    cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  if (causeMessage && causeMessage.trim()) {
    return `${error.message}\n${causeMessage}`;
  }
  return error.message;
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

  if (error instanceof OutputCollisionError) {
    return [
      error.message,
      `Existing artifacts: ${error.artifactNames.join(", ")}`,
      "Suggestion: choose a new --output directory or pass --overwrite after confirming these artifacts can be replaced.",
    ].join("\n");
  }

  if (error instanceof PlaybackStepError) {
    return formatPlaybackStepError(error);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
