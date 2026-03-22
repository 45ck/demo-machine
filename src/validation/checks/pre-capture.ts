import { registerCheck } from "../registry.js";
import { pass, fail, warn } from "../types.js";
import type { CheckContext, CheckResult } from "../types.js";

function preCaptureCheck(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const name = "pre-capture";
  const opts = ctx.options ?? {};

  // Basic environment check — Playwright availability is validated at runtime,
  // but we can detect obviously broken config early.
  try {
    require.resolve("playwright");
    results.push(pass("playwright-installed"));
  } catch {
    results.push(
      fail(name, "Playwright is not installed", "Run: npm install playwright"),
    );
    return results;
  }

  // Check headless mode setting
  if (opts.headless === false) {
    results.push(
      warn(name, "Running in headed mode — this may not work in CI environments"),
    );
  }

  if (results.length === 0) {
    return [pass(name)];
  }
  return results;
}

registerCheck({
  name: "pre-capture",
  phase: "pre-capture",
  fn: preCaptureCheck,
});
