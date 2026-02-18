import type { Step } from "../spec/types.js";

type Target =
  | { by: "css"; selector: string }
  | { by: "text"; text: string }
  | { by: "role"; role: string; name?: string | undefined }
  | { by: "testId"; testId: string };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isTarget(v: unknown): v is Target {
  if (typeof v !== "object" || v === null) return false;
  const by = (v as Record<string, unknown>)["by"];
  return by === "css" || by === "text" || by === "role" || by === "testId";
}

function roleSelector(role: string, name?: string): string {
  if (!name) return `role=${role}`;
  const escaped = name.replace(/"/g, '\\"');
  return `role=${role}[name="${escaped}"]`;
}

function selectorFromCssTarget(t: { selector?: unknown }): string | undefined {
  return isNonEmptyString(t.selector) ? t.selector : undefined;
}

function selectorFromTextTarget(t: { text?: unknown }): string | undefined {
  return isNonEmptyString(t.text) ? `text=${t.text}` : undefined;
}

function selectorFromRoleTarget(t: { role?: unknown; name?: unknown }): string | undefined {
  if (!isNonEmptyString(t.role)) return undefined;
  const name = isNonEmptyString(t.name) ? t.name : undefined;
  return roleSelector(t.role, name);
}

function selectorFromTestIdTarget(t: { testId?: unknown }): string | undefined {
  if (!isNonEmptyString(t.testId)) return undefined;
  const escaped = t.testId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `[data-testid="${escaped}"]`;
}

function selectorFromTarget(target: unknown): string | undefined {
  if (!isTarget(target)) return undefined;
  const by = target.by;
  const t = target as Record<string, unknown>;

  switch (by) {
    case "css":
      return selectorFromCssTarget(t);
    case "text":
      return selectorFromTextTarget(t);
    case "role":
      return selectorFromRoleTarget(t);
    case "testId":
      return selectorFromTestIdTarget(t);
    default:
      return undefined;
  }
}

export function resolveStepSelector(step: Step): string {
  const s = (step as unknown as { selector?: unknown }).selector;
  if (isNonEmptyString(s)) return s;

  const t = (step as unknown as { target?: unknown }).target;
  const selector = selectorFromTarget(t);
  if (selector) return selector;

  throw new Error(`Step "${step.action}" requires "selector" or supported "target"`);
}
