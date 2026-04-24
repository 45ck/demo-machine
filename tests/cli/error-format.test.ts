import { describe, expect, it } from "vitest";
import { formatCliError } from "../../src/cli/error-format.js";
import { SpecLoadError } from "../../src/spec/loader.js";
import { PreflightError } from "../../src/validation/errors.js";

describe("formatCliError", () => {
  it("omits stack traces for ordinary errors by default", () => {
    const error = new Error("Something failed");

    expect(formatCliError(error)).toBe("Something failed");
  });

  it("includes stack traces in verbose mode", () => {
    const error = new Error("Something failed");

    expect(formatCliError(error, { verbose: true })).toContain("Error: Something failed");
  });

  it("preserves spec load error messages", () => {
    const error = new SpecLoadError("Invalid spec in demo.yaml:\n  - meta.title: Required");

    expect(formatCliError(error)).toContain("meta.title");
  });

  it("formats preflight failures with suggestions", () => {
    const error = new PreflightError([
      {
        phase: "pre-capture",
        checkName: "spec-selectors",
        status: "fail",
        message: "Missing selector",
        suggestion: "Use target.by role or a stable data-testid.",
      },
    ]);

    expect(formatCliError(error)).toBe(
      [
        "Preflight validation failed",
        "- [spec-selectors] Missing selector",
        "  Suggestion: Use target.by role or a stable data-testid.",
      ].join("\n"),
    );
  });
});
