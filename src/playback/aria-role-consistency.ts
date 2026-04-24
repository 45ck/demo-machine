import type { PlaywrightPage } from "./playwright.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("a11y-guards");

interface RoleViolation {
  selector: string;
  role: string;
  missingProps: string[];
}

const ARIA_CHECKED = "aria-checked";
const ARIA_VALUENOW = "aria-valuenow";

const REQUIRED_ARIA_PROPS: Record<string, string[]> = {
  checkbox: [ARIA_CHECKED],
  combobox: ["aria-expanded"],
  heading: ["aria-level"],
  meter: [ARIA_VALUENOW],
  option: ["aria-selected"],
  radio: [ARIA_CHECKED],
  scrollbar: ["aria-controls", ARIA_VALUENOW],
  separator: [],
  slider: [ARIA_VALUENOW, "aria-valuemin", "aria-valuemax"],
  spinbutton: [ARIA_VALUENOW],
  switch: [ARIA_CHECKED],
};

export async function checkAriaRoleConsistency(page: PlaywrightPage): Promise<string[]> {
  try {
    const requiredMap = REQUIRED_ARIA_PROPS;
    const violations = (await page.evaluate(
      ((required: Record<string, string[]>) => {
        const results: Array<{
          selector: string;
          role: string;
          missingProps: string[];
        }> = [];

        for (const el of Array.from(document.querySelectorAll("[role]"))) {
          if (el.closest("[id^=dm-], [class*=dm-]")) continue;

          const role = el.getAttribute("role")?.toLowerCase();
          if (!role || !required[role]) continue;

          const requiredProps = required[role];
          if (!requiredProps) continue;
          const missing = requiredProps.filter((prop) => !el.hasAttribute(prop));
          if (missing.length === 0) continue;

          const tag = el.tagName.toLowerCase();
          const id = el.id;
          const classNames = Array.from(el.classList).slice(0, 2).join(".");
          let sel = tag;
          if (id) sel += `#${id}`;
          else if (classNames) sel += `.${classNames}`;

          results.push({ selector: sel, role, missingProps: missing });
        }
        return results;
      }) as (...args: unknown[]) => unknown,
      requiredMap as unknown,
    )) as RoleViolation[] | null;

    if (!violations || violations.length === 0) return [];

    const warnings: string[] = [];
    for (const v of violations) {
      const msg =
        `ARIA role warning: "${v.selector}" has role="${v.role}" ` +
        `but is missing required properties: ${v.missingProps.join(", ")}`;
      logger.warn(msg);
      warnings.push(msg);
    }
    return warnings;
  } catch {
    return [];
  }
}
