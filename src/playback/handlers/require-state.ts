import type { ActionHandler } from "../action-core.js";
import { buildEvent, stepTimeoutMs } from "../action-core.js";
import { resolveStepLocator } from "../selector.js";
import type { PlaywrightLocator, PlaywrightPage } from "../playwright.js";

/**
 * `requireState` is a precondition step. Functionally it's like `assert` —
 * the same fields (visible / text / count / value / checked / enabled) are
 * supported — but it is intended to be placed at chapter boundaries to
 * declare "this spec assumes the live app currently shows X."
 *
 * When the precondition fails, the error message is deliberately loud and
 * names the most likely cause: that the demo was authored against a
 * different database / fixture state than what's actually running. This
 * keeps a recording from silently producing a video that contradicts its
 * own narration when the underlying data has drifted.
 */

function truncate(value: string | null | undefined, maxLen = 200): string {
  if (value === null || value === undefined) return "<empty>";
  return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
}

function driftBanner(lines: string[]): string {
  const separator = "─".repeat(72);
  return [
    "",
    separator,
    "DATA DRIFT — demo precondition failed.",
    separator,
    ...lines,
    "",
    "The demo will not faithfully reflect its narration. Reset the",
    "database / fixtures to the state the spec was authored against,",
    "or update the spec to match the current state, then re-record.",
    separator,
    "",
  ].join("\n");
}

/**
 * All readers poll until either the deadline or a definitive answer. Without
 * polling, a precondition that runs immediately after a navigation can race
 * the React re-render and fail spuriously. The original `assert` handler
 * loops on the same pattern; `requireState` does the same.
 */
const POLL_INTERVAL_MS = 200;

async function pollUntil<T>(
  read: () => Promise<T>,
  isAccepted: (value: T) => boolean,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T = await read();
  while (Date.now() <= deadline) {
    if (isAccepted(last)) return last;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    last = await read();
  }
  return last;
}

async function readVisibility(locator: PlaywrightLocator, timeoutMs: number): Promise<boolean> {
  // .first() avoids Playwright's strict-mode throw when the selector
  // matches multiple elements (common for `table tbody tr`). For a
  // visibility precondition, "at least one of these is visible" is the
  // right semantic.
  const probe = locator.nth(0);
  try {
    await probe.waitFor({ state: "attached", timeout: Math.min(timeoutMs, 1500) });
  } catch {
    /* fall through — isVisible() will return false */
  }
  return pollUntil(
    async () => {
      try {
        return await probe.isVisible();
      } catch {
        return false;
      }
    },
    (v) => v === true,
    timeoutMs,
  );
}

async function readText(locator: PlaywrightLocator): Promise<string | null> {
  // .nth(0) avoids strict-mode throw when the selector matches multiple.
  try {
    return await locator.nth(0).textContent();
  } catch {
    return null;
  }
}

async function readCount(page: PlaywrightPage, selector: string): Promise<number> {
  try {
    return (await page.evaluate(
      ((sel: string) => document.querySelectorAll(sel).length) as (...args: unknown[]) => unknown,
      selector as unknown,
    )) as number;
  } catch {
    return -1;
  }
}

async function readValue(locator: PlaywrightLocator): Promise<string> {
  try {
    return (await locator
      .nth(0)
      .evaluate(
        ((el: unknown) => (el as HTMLInputElement).value ?? "") as (...args: unknown[]) => unknown,
      )) as string;
  } catch {
    return "";
  }
}

async function readChecked(locator: PlaywrightLocator): Promise<boolean | null> {
  try {
    return (await locator
      .nth(0)
      .evaluate(
        ((el: unknown) => (el as HTMLInputElement).checked ?? null) as (
          ...args: unknown[]
        ) => unknown,
      )) as boolean | null;
  } catch {
    return null;
  }
}

async function readEnabled(locator: PlaywrightLocator): Promise<boolean | null> {
  try {
    return (await locator
      .nth(0)
      .evaluate(
        ((el: unknown) => !(el as HTMLElement).hasAttribute("disabled")) as (
          ...args: unknown[]
        ) => unknown,
      )) as boolean | null;
  } catch {
    return null;
  }
}

interface DriftFailure {
  field: string;
  expected: unknown;
  actual: unknown;
}

interface CheckContext {
  page: PlaywrightPage;
  locator: PlaywrightLocator;
  selector: string | undefined;
  timeoutMs: number;
}

type Check = (step: RequireStateStep, ctx: CheckContext) => Promise<DriftFailure | null>;

interface RequireStateStep {
  action: "requireState";
  visible?: boolean;
  text?: string;
  count?: number;
  value?: string;
  checked?: boolean;
  enabled?: boolean;
  selector?: string;
  because?: string;
  narration?: string;
}

const checkVisible: Check = async (step, ctx) => {
  if (step.visible === undefined) return null;
  const actual = await readVisibility(ctx.locator, ctx.timeoutMs);
  if (actual === step.visible) return null;
  return { field: "visible", expected: step.visible, actual };
};

const checkText: Check = async (step, ctx) => {
  if (step.text === undefined) return null;
  const expected = step.text;
  const actual = await pollUntil(
    () => readText(ctx.locator),
    (v) => Boolean(v?.includes(expected)),
    ctx.timeoutMs,
  );
  if (actual?.includes(expected)) return null;
  return { field: "text contains", expected, actual };
};

const checkCount: Check = async (step, ctx) => {
  if (step.count === undefined) return null;
  if (!ctx.selector) {
    throw new Error(
      `requireState count requires a CSS "selector" (not "target") because it uses querySelectorAll`,
    );
  }
  const expected = step.count;
  const selector = ctx.selector;
  const actual = await pollUntil(
    () => readCount(ctx.page, selector),
    (v) => v === expected,
    ctx.timeoutMs,
  );
  if (actual === expected) return null;
  return { field: "count", expected, actual };
};

const checkValue: Check = async (step, ctx) => {
  if (step.value === undefined) return null;
  const expected = step.value;
  const actual = await pollUntil(
    () => readValue(ctx.locator),
    (v) => v === expected,
    ctx.timeoutMs,
  );
  if (actual === expected) return null;
  return { field: "value", expected, actual };
};

const checkChecked: Check = async (step, ctx) => {
  if (step.checked === undefined) return null;
  const expected = step.checked;
  const actual = await pollUntil(
    () => readChecked(ctx.locator),
    (v) => v === expected,
    ctx.timeoutMs,
  );
  if (actual === expected) return null;
  return { field: "checked", expected, actual };
};

const checkEnabled: Check = async (step, ctx) => {
  if (step.enabled === undefined) return null;
  const expected = step.enabled;
  const actual = await pollUntil(
    () => readEnabled(ctx.locator),
    (v) => v === expected,
    ctx.timeoutMs,
  );
  if (actual === expected) return null;
  return { field: "enabled", expected, actual };
};

const CHECKS: ReadonlyArray<Check> = [
  checkVisible,
  checkText,
  checkCount,
  checkValue,
  checkChecked,
  checkEnabled,
];

function throwDrift(params: {
  selectorForEvent: string;
  failure: DriftFailure;
  because: string | undefined;
  narration: string | undefined;
}): never {
  const lines: string[] = [];
  if (params.narration) lines.push(`Step:      ${params.narration}`);
  if (params.because) lines.push(`Assumed:   ${params.because}`);
  lines.push(`Target:    ${params.selectorForEvent}`);
  lines.push(`Field:     ${params.failure.field}`);
  lines.push(`Expected:  ${truncate(JSON.stringify(params.failure.expected))}`);
  lines.push(`Actual:    ${truncate(JSON.stringify(params.failure.actual))}`);
  throw new Error(driftBanner(lines));
}

export const handleRequireState: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "requireState") return;

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const checkCtx: CheckContext = {
    page: ctx.page,
    locator: resolved.locator,
    selector: (step as { selector?: string }).selector,
    timeoutMs,
  };
  const typed = step as unknown as RequireStateStep;

  for (const check of CHECKS) {
    const failure = await check(typed, checkCtx);
    if (failure) {
      throwDrift({
        selectorForEvent: resolved.selectorForEvent,
        failure,
        because: typed.because,
        narration: typed.narration,
      });
    }
  }

  events.push(
    buildEvent({
      action: "requireState",
      startTime: start,
      selector: resolved.selectorForEvent,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};
