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

async function readVisibility(locator: PlaywrightLocator, timeoutMs: number): Promise<boolean> {
  try {
    await locator.waitFor({ state: "attached", timeout: Math.min(timeoutMs, 1500) });
    return await locator.isVisible();
  } catch {
    return false;
  }
}

async function readText(locator: PlaywrightLocator): Promise<string | null> {
  try {
    return await locator.textContent();
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
    return (await locator.evaluate(
      ((el: unknown) => (el as HTMLInputElement).value ?? "") as (...args: unknown[]) => unknown,
    )) as string;
  } catch {
    return "";
  }
}

async function readChecked(locator: PlaywrightLocator): Promise<boolean | null> {
  try {
    return (await locator.evaluate(
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
    return (await locator.evaluate(
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
  const actual = await readText(ctx.locator);
  if (actual?.includes(step.text)) return null;
  return { field: "text contains", expected: step.text, actual };
};

const checkCount: Check = async (step, ctx) => {
  if (step.count === undefined) return null;
  if (!ctx.selector) {
    throw new Error(
      `requireState count requires a CSS "selector" (not "target") because it uses querySelectorAll`,
    );
  }
  const actual = await readCount(ctx.page, ctx.selector);
  if (actual === step.count) return null;
  return { field: "count", expected: step.count, actual };
};

const checkValue: Check = async (step, ctx) => {
  if (step.value === undefined) return null;
  const actual = await readValue(ctx.locator);
  if (actual === step.value) return null;
  return { field: "value", expected: step.value, actual };
};

const checkChecked: Check = async (step, ctx) => {
  if (step.checked === undefined) return null;
  const actual = await readChecked(ctx.locator);
  if (actual === step.checked) return null;
  return { field: "checked", expected: step.checked, actual };
};

const checkEnabled: Check = async (step, ctx) => {
  if (step.enabled === undefined) return null;
  const actual = await readEnabled(ctx.locator);
  if (actual === step.enabled) return null;
  return { field: "enabled", expected: step.enabled, actual };
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
