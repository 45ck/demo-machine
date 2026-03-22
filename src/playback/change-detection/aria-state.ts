import type { PlaywrightPage } from "../playwright.js";
import type { Step } from "../../spec/types.js";
import type { ChangeDetector, DetectorSignal } from "./types.js";

/** ARIA attributes and related properties worth tracking for state changes. */
const TRACKED_ATTRS = [
  "aria-checked",
  "aria-expanded",
  "aria-selected",
  "aria-pressed",
  "aria-hidden",
  "aria-disabled",
  "aria-readonly",
  "aria-required",
  "aria-invalid",
  "aria-busy",
  "aria-valuenow",
  "aria-valuetext",
  "role",
  "disabled",
] as const;

type AriaSnapshot = Record<string, string | null>;

function getSelector(step: Step): string | undefined {
  if ("selector" in step && typeof step.selector === "string") return step.selector;
  return undefined;
}

/**
 * Captures ARIA attributes on the step's target element before and after
 * the action, then diffs them.  Skipped when the step has no target selector.
 */
export class AriaStateDetector implements ChangeDetector {
  readonly name = "aria-state";
  private snapshot: AriaSnapshot | undefined;
  private hasSelector = false;

  async before(page: PlaywrightPage, step: Step): Promise<void> {
    const selector = getSelector(step);
    if (!selector) {
      this.hasSelector = false;
      this.snapshot = undefined;
      return;
    }
    this.hasSelector = true;
    this.snapshot = await captureAriaState(page, selector);
  }

  async after(page: PlaywrightPage, step: Step): Promise<DetectorSignal> {
    if (!this.hasSelector) {
      return {
        detector: this.name,
        changesDetected: false,
        confidence: 0,
        details: "skipped (no target selector)",
      };
    }

    const selector = getSelector(step);
    const after = selector ? await captureAriaState(page, selector) : undefined;
    const before = this.snapshot;
    this.snapshot = undefined;

    if (!before || !after) {
      return {
        detector: this.name,
        changesDetected: false,
        confidence: 0,
        details: "could not capture ARIA state",
      };
    }

    const changed: string[] = [];
    for (const attr of TRACKED_ATTRS) {
      if (before[attr] !== after[attr]) {
        changed.push(attr);
      }
    }

    return {
      detector: this.name,
      changesDetected: changed.length > 0,
      confidence: Math.min(1, changed.length / 3),
      details:
        changed.length > 0
          ? `${String(changed.length)} ARIA changes: ${changed.join(", ")}`
          : "no ARIA state changes",
    };
  }
}

async function captureAriaState(
  page: PlaywrightPage,
  selector: string,
): Promise<AriaSnapshot | undefined> {
  const attrs = [...TRACKED_ATTRS];
  const result = (await page.evaluate(
    ((args: { selector: string; attrs: string[] }) => {
      const el = document.querySelector(args.selector);
      if (!el) return null;
      const out: Record<string, string | null> = {};
      for (const a of args.attrs) {
        if (a === "disabled") {
          out[a] = (el as HTMLElement & { disabled?: boolean }).disabled ? "true" : null;
        } else {
          out[a] = el.getAttribute(a);
        }
      }
      return out;
    }) as (...args: unknown[]) => unknown,
    { selector, attrs } as unknown,
  )) as AriaSnapshot | null;

  return result ?? undefined;
}
