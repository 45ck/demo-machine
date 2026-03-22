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

function validateCssSelector(selector: string): string | null {
  if (selector.trim().length === 0) return "Empty selector";
  if (/[{}]/.test(selector)) return "Selector contains CSS block delimiters";
  if (/^\d/.test(selector.trim())) return "Selector starts with a digit (invalid CSS)";
  return null;
}

function checkSelectors(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const spec = ctx.spec as Record<string, unknown>;
  const chapters = (spec.chapters ?? []) as Array<Record<string, unknown>>;
  const name = "spec-selectors";

  let stepIndex = 0;
  for (const chapter of chapters) {
    const steps = (chapter.steps ?? []) as Array<Record<string, unknown>>;
    for (const step of steps) {
      // Check CSS selectors
      if (typeof step.selector === "string") {
        const err = validateCssSelector(step.selector);
        if (err) {
          results.push(
            fail(name, `Step ${stepIndex} selector "${step.selector}": ${err}`, "Fix the CSS selector syntax"),
          );
        }
      }

      // Check target-based role selectors
      if (step.target && typeof step.target === "object") {
        const target = step.target as Record<string, unknown>;
        if (target.by === "role" && typeof target.role === "string") {
          if (!KNOWN_ARIA_ROLES.has(target.role)) {
            results.push(
              warn(name, `Step ${stepIndex} uses unknown ARIA role "${target.role}"`),
            );
          }
        }
      }

      // Check dragAndDrop from/to selectors
      if (step.action === "dragAndDrop") {
        for (const endpoint of ["from", "to"] as const) {
          const ep = step[endpoint] as Record<string, unknown> | undefined;
          if (ep && typeof ep.selector === "string") {
            const err = validateCssSelector(ep.selector);
            if (err) {
              results.push(
                fail(
                  name,
                  `Step ${stepIndex} dragAndDrop.${endpoint} selector "${ep.selector}": ${err}`,
                  "Fix the CSS selector syntax",
                ),
              );
            }
          }
        }
      }

      stepIndex++;
    }
  }

  if (results.length === 0) {
    return [pass(name)];
  }
  return results;
}

registerCheck({
  name: "spec-selectors",
  phase: "pre-capture",
  fn: checkSelectors,
});
