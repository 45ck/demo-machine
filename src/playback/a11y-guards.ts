import type { PlaywrightPage } from "./playwright.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("a11y-guards");

// ---------------------------------------------------------------------------
// Internal types returned from page.evaluate()
// ---------------------------------------------------------------------------
interface ElementInfo {
  tag: string;
  role: string | null;
  contentEditable: string;
  type: string | null;
}

interface UnlabelledElement {
  tag: string;
  type: string | null;
  id: string;
  selector: string;
}

interface RoleViolation {
  selector: string;
  role: string;
  missingProps: string[];
}

// ---------------------------------------------------------------------------
// Shared role constants
// ---------------------------------------------------------------------------
const ROLE_CHECKBOX = "checkbox";
const ROLE_SWITCH = "switch";
const ROLE_RADIO = "radio";

// ---------------------------------------------------------------------------
// Validation logic — extracted from the main functions to reduce complexity
// ---------------------------------------------------------------------------

function isValidClickTarget(tag: string, role: string | null): boolean {
  const validTags = new Set(["BUTTON", "A", "INPUT", "SUMMARY"]);
  return validTags.has(tag) || role === "button" || role === "link" || role === "menuitem";
}

function isValidTypeTarget(tag: string, role: string | null, contentEditable: string): boolean {
  const validTags = new Set(["INPUT", "TEXTAREA"]);
  return (
    validTags.has(tag) || contentEditable === "true" || role === "textbox" || role === "searchbox"
  );
}

function isValidCheckTarget(tag: string, role: string | null, inputType: string | null): boolean {
  const isCheckboxInput = tag === "INPUT" && (inputType === "checkbox" || inputType === "radio");
  return isCheckboxInput || role === ROLE_CHECKBOX || role === ROLE_SWITCH || role === ROLE_RADIO;
}

function isValidSelectTarget(tag: string, role: string | null): boolean {
  return tag === "SELECT" || role === "listbox" || role === "combobox";
}

function isActionabilityValid(
  action: string,
  info: ElementInfo,
  tag: string,
  role: string | null,
): boolean {
  switch (action) {
    case "click":
      return isValidClickTarget(tag, role);
    case "type":
      return isValidTypeTarget(tag, role, info.contentEditable);
    case "check":
    case "uncheck":
      return isValidCheckTarget(tag, role, info.type);
    case "select":
      return isValidSelectTarget(tag, role);
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// #35: Actionability Attribute Validator
// ---------------------------------------------------------------------------
const VALIDATED_ACTIONS = new Set(["click", "type", "check", "uncheck", "select"]);

/**
 * Before each action, validate the target has correct HTML semantics.
 *
 * - `click`: target should be button, a, input, or have role="button"
 * - `type`: target should be input, textarea, or contenteditable
 * - `check`/`uncheck`: target should be input[type=checkbox] or role="checkbox"/"switch"
 * - `select`: target should be select or role="listbox"
 *
 * Emits a WARNING (not error) when semantics don't match.
 * Never throws — returns null on any error.
 */
export async function checkActionability(
  page: PlaywrightPage,
  selector: string,
  action: string,
): Promise<string | null> {
  if (!VALIDATED_ACTIONS.has(action)) return null;

  try {
    const info = (await page.evaluate(
      ((sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const htmlEl = el as HTMLElement;
        return {
          tag: el.tagName,
          role: el.getAttribute("role"),
          contentEditable: htmlEl.contentEditable ?? "inherit",
          type: (el as HTMLInputElement).type ?? null,
        };
      }) as (...args: unknown[]) => unknown,
      selector as unknown,
    )) as ElementInfo | null;

    if (!info) return null;

    const tag = info.tag.toUpperCase();
    const role = info.role?.toLowerCase() ?? null;

    if (isActionabilityValid(action, info, tag, role)) return null;

    const rolePart = role ? ` role="${role}"` : "";
    const msg =
      `Actionability warning: "${selector}" target is <${tag}${rolePart}> ` +
      `which is not a standard element for "${action}". ` +
      `The action may still work via JS handlers.`;
    logger.warn(msg);
    return msg;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// #64: Missing Label Detection
// ---------------------------------------------------------------------------
/**
 * Post-navigate, scan all interactive elements and check they have an
 * accessible name via aria-label, aria-labelledby, associated <label>,
 * title, or visible text content.
 *
 * Returns an array of warning strings (one per unlabelled element).
 * Never throws — returns [] on any error.
 */
export async function checkMissingLabels(page: PlaywrightPage): Promise<string[]> {
  try {
    const elements = (await page.evaluate((() => {
      const interactiveSelector =
        'input:not([type="hidden"]), select, textarea, button, ' +
        "[role=button], [role=checkbox], [role=radio], [role=switch], " +
        "[role=slider], [role=textbox], [role=combobox], [role=listbox], " +
        "[role=searchbox], [role=spinbutton], [role=menuitem]";
      const results: Array<{
        tag: string;
        type: string | null;
        id: string;
        selector: string;
      }> = [];

      for (const el of Array.from(document.querySelectorAll(interactiveSelector))) {
        if (el.closest("[id^=dm-], [class*=dm-]")) continue;
        const htmlEl = el as HTMLElement;
        if (htmlEl.hidden || htmlEl.offsetParent === null) continue;
        if (hasAccessibleName(el)) continue;

        const tag = el.tagName;
        const type = (el as HTMLInputElement).type || null;
        const id = el.id || "";
        const classNames = Array.from(el.classList).slice(0, 2).join(".");
        let sel = tag.toLowerCase();
        if (id) sel += `#${id}`;
        else if (classNames) sel += `.${classNames}`;

        results.push({ tag, type, id, selector: sel });
      }
      return results;

      function hasAriaName(el: Element): boolean {
        if (el.getAttribute("aria-label")?.trim()) return true;
        const labelledBy = el.getAttribute("aria-labelledby")?.trim();
        if (!labelledBy) return false;
        const refEl = document.getElementById(labelledBy.split(/\s+/)[0]!);
        return Boolean(refEl?.textContent?.trim());
      }

      function hasLabelAssociation(el: Element): boolean {
        if (el.id) {
          const label = document.querySelector(`label[for="${el.id}"]`);
          if (label?.textContent?.trim()) return true;
        }
        return Boolean(el.closest("label")?.textContent?.trim());
      }

      function hasImplicitName(el: Element): boolean {
        if (el.getAttribute("title")?.trim()) return true;
        if (el.getAttribute("placeholder")?.trim()) return true;
        if (el.tagName === "BUTTON" && el.textContent?.trim()) return true;
        if (el.tagName === "BUTTON" && el.querySelector("img[alt]")) return true;
        const isSubmitOrReset =
          el.tagName === "INPUT" &&
          ((el as HTMLInputElement).type === "submit" || (el as HTMLInputElement).type === "reset");
        return isSubmitOrReset && Boolean(el.getAttribute("value")?.trim());
      }

      function hasAccessibleName(el: Element): boolean {
        return hasAriaName(el) || hasLabelAssociation(el) || hasImplicitName(el);
      }
    }) as (...args: unknown[]) => unknown)) as UnlabelledElement[] | null;

    if (!elements || elements.length === 0) return [];

    const warnings: string[] = [];
    for (const el of elements) {
      const typePart = el.type ? `[type=${el.type}]` : "";
      const msg =
        `Missing label warning: <${el.tag}${typePart}> at "${el.selector}" has no accessible name ` +
        `(missing aria-label, aria-labelledby, <label>, title, or text content)`;
      logger.warn(msg);
      warnings.push(msg);
    }
    return warnings;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// #71: Semantic HTML Validation for Form Steps
// ---------------------------------------------------------------------------

const FORM_ACTIONS = new Set(["type", "check", "uncheck", "select"]);

function isSemanticTypeTarget(tag: string, role: string | null): boolean {
  const semanticTags = new Set(["INPUT", "TEXTAREA"]);
  return semanticTags.has(tag) || role === "textbox" || role === "searchbox" || role === "combobox";
}

function isSemanticCheckTarget(
  tag: string,
  role: string | null,
  inputType: string | null,
): boolean {
  const isCheckableInput = tag === "INPUT" && (inputType === "checkbox" || inputType === "radio");
  return isCheckableInput || role === ROLE_CHECKBOX || role === ROLE_SWITCH || role === ROLE_RADIO;
}

function isSemanticSelectTarget(tag: string, role: string | null): boolean {
  return tag === "SELECT" || role === "listbox" || role === "combobox" || role === "menu";
}

function isSemanticFormElement(
  action: string,
  tag: string,
  role: string | null,
  inputType: string | null,
): boolean {
  switch (action) {
    case "type":
      return isSemanticTypeTarget(tag, role);
    case "check":
    case "uncheck":
      return isSemanticCheckTarget(tag, role, inputType);
    case "select":
      return isSemanticSelectTarget(tag, role);
    default:
      return true;
  }
}

/**
 * Before type/check/uncheck/select steps, verify targets use semantically
 * correct HTML (not div/span without ARIA roles).
 *
 * Never throws — returns null on any error.
 */
export async function checkSemanticFormTarget(
  page: PlaywrightPage,
  selector: string,
  action: string,
): Promise<string | null> {
  if (!FORM_ACTIONS.has(action)) return null;

  try {
    const info = (await page.evaluate(
      ((sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        return {
          tag: el.tagName,
          role: el.getAttribute("role"),
          type: (el as HTMLInputElement).type ?? null,
        };
      }) as (...args: unknown[]) => unknown,
      selector as unknown,
    )) as { tag: string; role: string | null; type: string | null } | null;

    if (!info) return null;

    const tag = info.tag.toUpperCase();
    const role = info.role?.toLowerCase() ?? null;

    if (isSemanticFormElement(action, tag, role, info.type)) return null;

    const rolePart = role ? ` role="${role}"` : "";
    const msg =
      `Semantic form warning: "${selector}" is <${tag}${rolePart}> — ` +
      `not semantic HTML for "${action}". Consider using a native form element or adding an ARIA role.`;
    logger.warn(msg);
    return msg;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// #61: ARIA Role Consistency Audit
// ---------------------------------------------------------------------------

/**
 * Map of ARIA roles to their required properties.
 * Based on WAI-ARIA 1.2 specification.
 */
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
  separator: [], // only when focusable: aria-valuenow
  slider: [ARIA_VALUENOW, "aria-valuemin", "aria-valuemax"],
  spinbutton: [ARIA_VALUENOW],
  switch: [ARIA_CHECKED],
};

/**
 * After each interactive step, scan elements with explicit role attributes
 * and validate required ARIA properties are present.
 *
 * Returns an array of warning strings (one per violation).
 * Never throws — returns [] on any error.
 */
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
