import { registerCheck } from "../registry.js";
import { pass, fail, warn } from "../types.js";
import type { CheckContext, CheckResult } from "../types.js";

const KNOWN_ARIA_ROLES = new Set([
  "alert",
  "alertdialog",
  "application",
  "article",
  "banner",
  "blockquote",
  "button",
  "caption",
  "cell",
  "checkbox",
  "code",
  "columnheader",
  "combobox",
  "complementary",
  "contentinfo",
  "definition",
  "deletion",
  "dialog",
  "directory",
  "document",
  "emphasis",
  "feed",
  "figure",
  "form",
  "generic",
  "grid",
  "gridcell",
  "group",
  "heading",
  "img",
  "insertion",
  "link",
  "list",
  "listbox",
  "listitem",
  "log",
  "main",
  "marquee",
  "math",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "meter",
  "navigation",
  "none",
  "note",
  "option",
  "paragraph",
  "presentation",
  "progressbar",
  "radio",
  "radiogroup",
  "region",
  "row",
  "rowgroup",
  "rowheader",
  "scrollbar",
  "search",
  "searchbox",
  "separator",
  "slider",
  "spinbutton",
  "status",
  "strong",
  "subscript",
  "superscript",
  "switch",
  "tab",
  "table",
  "tablist",
  "tabpanel",
  "term",
  "textbox",
  "time",
  "timer",
  "toolbar",
  "tooltip",
  "tree",
  "treegrid",
  "treeitem",
]);

export { KNOWN_ARIA_ROLES };

interface SelectorTarget {
  by?: string;
  role?: string;
}

interface DragEndpoint {
  selector?: string;
}

interface SelectorStep {
  action?: string;
  selector?: string;
  target?: SelectorTarget;
  from?: DragEndpoint;
  to?: DragEndpoint;
}

interface SelectorsSpecShape {
  chapters?: Array<{ steps?: SelectorStep[] }>;
}

const CHECK_NAME = "spec-selectors";
const SELECTOR_HINT = "Fix the CSS selector syntax";

function validateCssSelector(selector: string): string | null {
  if (selector.trim().length === 0) return "Empty selector";
  if (/[{}]/.test(selector)) return "Selector contains CSS block delimiters";
  if (/^\d/.test(selector.trim())) return "Selector starts with a digit (invalid CSS)";
  return null;
}

function checkCssSelector(selector: string, prefix: string, results: CheckResult[]): void {
  const err = validateCssSelector(selector);
  if (err) {
    results.push(fail(CHECK_NAME, `${prefix} "${selector}": ${err}`, SELECTOR_HINT));
  }
}

function checkTargetRole(target: SelectorTarget, stepIndex: number, results: CheckResult[]): void {
  if (
    target.by === "role" &&
    typeof target.role === "string" &&
    !KNOWN_ARIA_ROLES.has(target.role)
  ) {
    results.push(warn(CHECK_NAME, `Step ${stepIndex} uses unknown ARIA role "${target.role}"`));
  }
}

function checkDragEndpoints(step: SelectorStep, stepIndex: number, results: CheckResult[]): void {
  for (const endpoint of ["from", "to"] as const) {
    const ep = step[endpoint];
    if (ep && typeof ep.selector === "string") {
      checkCssSelector(ep.selector, `Step ${stepIndex} dragAndDrop.${endpoint} selector`, results);
    }
  }
}

function checkStepSelectors(step: SelectorStep, stepIndex: number, results: CheckResult[]): void {
  if (typeof step.selector === "string") {
    checkCssSelector(step.selector, `Step ${stepIndex} selector`, results);
  }

  if (step.target && typeof step.target === "object") {
    checkTargetRole(step.target, stepIndex, results);
  }

  if (step.action === "dragAndDrop") {
    checkDragEndpoints(step, stepIndex, results);
  }
}

function checkSelectors(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const spec = ctx.spec as SelectorsSpecShape;
  const chapters = spec.chapters ?? [];

  let stepIndex = 0;
  for (const chapter of chapters) {
    for (const step of chapter.steps ?? []) {
      checkStepSelectors(step, stepIndex, results);
      stepIndex++;
    }
  }

  return results.length === 0 ? [pass(CHECK_NAME)] : results;
}

registerCheck({
  name: "spec-selectors",
  phase: "pre-capture",
  fn: checkSelectors,
});
