import type { PlaywrightPage } from "../playwright.js";
import type { Step } from "../../spec/types.js";
import type { ChangeDetector, DetectorSignal } from "./types.js";

/** CSS properties worth tracking for visual change. */
const TRACKED_PROPERTIES = [
  "display",
  "visibility",
  "opacity",
  "width",
  "height",
  "color",
  "backgroundColor",
  "transform",
  "position",
] as const;

type StyleSnapshot = Record<string, string>;

function getSelector(step: Step): string | undefined {
  if ("selector" in step && typeof step.selector === "string") return step.selector;
  return undefined;
}

/**
 * Captures key computed styles on the step's target element before and after
 * the action, then diffs them.  Skipped when the step has no target selector.
 */
export class ComputedStyleDetector implements ChangeDetector {
  readonly name = "computed-style";
  private snapshot: StyleSnapshot | undefined;
  private hasSelector = false;

  async before(page: PlaywrightPage, step: Step): Promise<void> {
    const selector = getSelector(step);
    if (!selector) {
      this.hasSelector = false;
      this.snapshot = undefined;
      return;
    }
    this.hasSelector = true;
    this.snapshot = await captureStyles(page, selector);
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
    const after = selector ? await captureStyles(page, selector) : undefined;
    const before = this.snapshot;
    this.snapshot = undefined;

    if (!before || !after) {
      return {
        detector: this.name,
        changesDetected: false,
        confidence: 0,
        details: "could not capture styles",
      };
    }

    const changed: string[] = [];
    for (const prop of TRACKED_PROPERTIES) {
      if (before[prop] !== after[prop]) {
        changed.push(prop);
      }
    }

    return {
      detector: this.name,
      changesDetected: changed.length > 0,
      confidence: Math.min(1, changed.length / 3),
      details:
        changed.length > 0
          ? `${String(changed.length)} style changes: ${changed.join(", ")}`
          : "no computed style changes",
    };
  }
}

async function captureStyles(
  page: PlaywrightPage,
  selector: string,
): Promise<StyleSnapshot | undefined> {
  const props = [...TRACKED_PROPERTIES];
  const result = (await page.evaluate(
    ((args: { selector: string; props: string[] }) => {
      const el = document.querySelector(args.selector);
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      const out: Record<string, string> = {};
      for (const p of args.props) {
        out[p] = cs.getPropertyValue(p);
      }
      return out;
    }) as (...args: unknown[]) => unknown,
    { selector, props } as unknown,
  )) as StyleSnapshot | null;

  return result ?? undefined;
}
