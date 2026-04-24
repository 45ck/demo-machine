import { createRequire } from "node:module";
import { registerCheck } from "../registry.js";
import { pass, fail, warn } from "../types.js";
import type { CheckContext, CheckResult } from "../types.js";

interface PreCaptureOptions {
  headless?: boolean;
}

const CHECK_NAME = "pre-capture";
const require = createRequire(import.meta.url);

function preCaptureCheck(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const opts = (ctx["options"] ?? {}) as PreCaptureOptions;

  // Basic environment check — Playwright availability is validated at runtime,
  // but we can detect obviously broken config early.
  try {
    require.resolve("playwright");
    results.push(pass("playwright-installed"));
  } catch {
    results.push(fail(CHECK_NAME, "Playwright is not installed", "Run: npm install playwright"));
    return results;
  }

  // Check headless mode setting
  if (opts.headless === false) {
    results.push(warn(CHECK_NAME, "Running in headed mode — this may not work in CI environments"));
  }

  if (results.length === 0) {
    return [pass(CHECK_NAME)];
  }
  return results;
}

registerCheck({
  name: CHECK_NAME,
  phase: CHECK_NAME,
  fn: preCaptureCheck,
});
