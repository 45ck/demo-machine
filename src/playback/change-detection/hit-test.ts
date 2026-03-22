import type { PlaywrightPage } from "../playwright.js";
import type { Step } from "../../spec/types.js";
import type { ChangeDetector, DetectorSignal } from "./types.js";

function getSelector(step: Step): string | undefined {
  if ("selector" in step && typeof step.selector === "string") return step.selector;
  return undefined;
}

/**
 * Validates that the target element is not obscured by overlays or modals
 * using `document.elementFromPoint()` at the center of the target's bounding
 * box.
 *
 * **Opt-in only** — not included in the default detector set.  Always returns
 * `changesDetected: true` to avoid false {@link NoVisibleChangeError} throws;
 * it reports failures via the `details` string and high confidence.
 */
export class HitTestDetector implements ChangeDetector {
  readonly name = "hit-test";

  async before(_page: PlaywrightPage, _step: Step): Promise<void> {
    // No pre-action state needed.
  }

  async after(page: PlaywrightPage, step: Step): Promise<DetectorSignal> {
    const selector = getSelector(step);
    if (!selector) {
      return {
        detector: this.name,
        changesDetected: true,
        confidence: 0,
        details: "skipped (no target selector)",
      };
    }

    const result = (await page.evaluate(
      ((sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return { found: false, hit: false, topTag: "" };
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const topEl = document.elementFromPoint(cx, cy);
        if (!topEl) return { found: true, hit: false, topTag: "null" };
        const hit = el === topEl || el.contains(topEl);
        const topTag = `<${topEl.tagName.toLowerCase()}${topEl.id ? `#${topEl.id}` : ""}${topEl.className ? `.${String(topEl.className).split(" ")[0]}` : ""}>`;
        return { found: true, hit, topTag };
      }) as (...args: unknown[]) => unknown,
      selector as unknown,
    )) as { found: boolean; hit: boolean; topTag: string };

    if (!result.found) {
      return {
        detector: this.name,
        changesDetected: true,
        confidence: 0.9,
        details: `element not found: ${selector}`,
      };
    }

    if (!result.hit) {
      return {
        detector: this.name,
        changesDetected: true,
        confidence: 0.95,
        details: `element obscured by ${result.topTag} at center point`,
      };
    }

    return {
      detector: this.name,
      changesDetected: true,
      confidence: 0,
      details: "element is topmost at center point",
    };
  }
}
