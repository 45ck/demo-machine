import type { Step } from "../spec/types.js";
import type { PlaywrightLocator, PlaywrightPage } from "./playwright.js";

type Target =
  | { by: "css"; selector: string }
  | { by: "text"; text: string; exact?: boolean }
  | { by: "role"; role: string; name?: string; exact?: boolean }
  | { by: "testId"; testId: string }
  | { by: "label"; text: string; exact?: boolean }
  | { by: "placeholder"; text: string; exact?: boolean }
  | { by: "altText"; text: string; exact?: boolean }
  | { by: "title"; text: string; exact?: boolean };

type TextTarget = Extract<Target, { by: "text" | "label" | "placeholder" | "altText" | "title" }>;

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

function selectorFromUnknown(step: Step): string | undefined {
  const s = (step as unknown as { selector?: unknown }).selector;
  return isNonEmptyString(s) ? s : undefined;
}

function targetFromUnknown(step: Step): Target | undefined {
  const t = (step as unknown as { target?: unknown }).target;
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
  const s = selectorFromUnknown(step);
  if (s) return s;

  const t = targetFromUnknown(step);
  if (t) return `target(${stringifyTarget(t)})`;

  return `action(${step.action})`;
}

export function resolveStepLocator(
  page: PlaywrightPage,
  step: Step,
): { locator: PlaywrightLocator; selectorForEvent: string } {
  const s = selectorFromUnknown(step);
  if (s) return { locator: page.locator(s), selectorForEvent: s };

  const t = targetFromUnknown(step);
  if (!t) {
    throw new Error(`Step "${step.action}" requires "selector" or supported "target"`);
  }

  const selectorForEvent = `target(${stringifyTarget(t)})`;

  if (t.by === "css") return { locator: page.locator(t.selector), selectorForEvent };
  if (t.by === "testId") return { locator: page.getByTestId(t.testId), selectorForEvent };
  if (t.by === "role") {
    return {
      locator: page.getByRole(t.role, {
        ...(t.name !== undefined ? { name: t.name } : {}),
        ...(t.exact !== undefined ? { exact: t.exact } : {}),
      }),
      selectorForEvent,
    };
  }

  return { locator: locatorFromTextTarget(page, t), selectorForEvent };
}
