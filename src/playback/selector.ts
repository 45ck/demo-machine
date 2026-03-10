import type { Step } from "../spec/types.js";
import type { PlaywrightLocator, PlaywrightPage } from "./playwright.js";

export type Target =
  | { by: "css"; selector: string }
  | { by: "text"; text: string; exact?: boolean }
  | { by: "role"; role: string; name?: string; exact?: boolean }
  | { by: "testId"; testId: string }
  | { by: "label"; text: string; exact?: boolean }
  | { by: "placeholder"; text: string; exact?: boolean }
  | { by: "altText"; text: string; exact?: boolean }
  | { by: "title"; text: string; exact?: boolean };

type TextTarget = Extract<Target, { by: "text" | "label" | "placeholder" | "altText" | "title" }>;

interface LocatorInput {
  selector?: string | undefined;
  target?: Target | undefined;
  nth?: number | undefined;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isTarget(v: unknown): v is Target {
  if (typeof v !== "object" || v === null) return false;
  const by = (v as Record<string, unknown>)["by"];
  return (
    by === "css" ||
    by === "text" ||
    by === "role" ||
    by === "testId" ||
    by === "label" ||
    by === "placeholder" ||
    by === "altText" ||
    by === "title"
  );
}

function stringifyTarget(target: Target): string {
  switch (target.by) {
    case "css":
      return `css:${target.selector}`;
    case "testId":
      return `testId:${target.testId}`;
    case "role":
      return target.name ? `role:${target.role}[name="${target.name}"]` : `role:${target.role}`;
    default:
      return `${target.by}:${target.text}`;
  }
}

function formatNth(nth: number | undefined): string {
  if (nth === undefined) return "";
  return `[nth=${String(nth)}]`;
}

function nthFromUnknown(obj: unknown): number | undefined {
  const v = (obj as Record<string, unknown> | null | undefined)?.["nth"];
  if (typeof v === "number" && Number.isFinite(v) && v >= 0 && Number.isInteger(v)) return v;
  return undefined;
}

function selectorFromUnknown(obj: unknown): string | undefined {
  const s = (obj as Record<string, unknown> | null | undefined)?.["selector"];
  return isNonEmptyString(s) ? s : undefined;
}

function targetFromUnknown(obj: unknown): Target | undefined {
  const t = (obj as Record<string, unknown> | null | undefined)?.["target"];
  return isTarget(t) ? t : undefined;
}

function exactOption(exact: boolean | undefined): { exact: boolean } | undefined {
  return exact !== undefined ? { exact } : undefined;
}

function locatorFromTextTarget(page: PlaywrightPage, t: TextTarget): PlaywrightLocator {
  const opt = exactOption(t.exact);
  switch (t.by) {
    case "text":
      return page.getByText(t.text, opt);
    case "label":
      return page.getByLabel(t.text, opt);
    case "placeholder":
      return page.getByPlaceholder(t.text, opt);
    case "altText":
      return page.getByAltText(t.text, opt);
    case "title":
      return page.getByTitle(t.text, opt);
  }
}

export function selectorForEvent(step: Step): string {
  return selectorForEventFromInput(
    {
      selector: selectorFromUnknown(step),
      target: targetFromUnknown(step),
      nth: nthFromUnknown(step),
    },
    `action(${step.action})`,
  );
}

function applyNth(locator: PlaywrightLocator, nth: number | undefined): PlaywrightLocator {
  if (nth === undefined) return locator;
  return locator.nth(nth);
}

export function selectorForEventFromInput(input: LocatorInput, fallback: string): string {
  if (input.selector) return `${input.selector}${formatNth(input.nth)}`;
  if (input.target) return `target(${stringifyTarget(input.target)})${formatNth(input.nth)}`;
  return fallback;
}

export function resolveLocatorFromInput(
  page: PlaywrightPage,
  input: LocatorInput,
  labelForErrors: string,
): { locator: PlaywrightLocator; selectorForEvent: string } {
  const nth = input.nth;
  const s = input.selector;
  if (s)
    return { locator: applyNth(page.locator(s), nth), selectorForEvent: `${s}${formatNth(nth)}` };

  const t = input.target;
  if (!t) {
    throw new Error(`${labelForErrors} requires "selector" or supported "target"`);
  }

  const selectorForEvent = `target(${stringifyTarget(t)})${formatNth(nth)}`;

  if (t.by === "css") return { locator: applyNth(page.locator(t.selector), nth), selectorForEvent };
  if (t.by === "testId")
    return { locator: applyNth(page.getByTestId(t.testId), nth), selectorForEvent };
  if (t.by === "role") {
    return {
      locator: applyNth(
        page.getByRole(t.role, {
          ...(t.name !== undefined ? { name: t.name } : {}),
          ...(t.exact !== undefined ? { exact: t.exact } : {}),
        }),
        nth,
      ),
      selectorForEvent,
    };
  }

  return { locator: applyNth(locatorFromTextTarget(page, t), nth), selectorForEvent };
}

export function resolveStepLocator(
  page: PlaywrightPage,
  step: Step,
): { locator: PlaywrightLocator; selectorForEvent: string } {
  return resolveLocatorFromInput(
    page,
    {
      selector: selectorFromUnknown(step),
      target: targetFromUnknown(step),
      nth: nthFromUnknown(step),
    },
    `Step "${step.action}"`,
  );
}
