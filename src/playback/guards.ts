import type { PlaywrightPage } from "./playwright.js";
import type { BoundingBox } from "./types.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("guards");

interface HitTestResult {
  tag: string;
  id: string;
  className: string;
  zIndex: string;
}

/**
 * Pre-click hit-test gate (#21).
 *
 * Runs `document.elementFromPoint()` at the center of the target's bounding box.
 * If the topmost element is NOT the target (or a descendant), returns a warning
 * with the obscuring element's tag, id, class, and z-index.
 *
 * Never throws — returns null on any error.
 */
export async function checkHitTest(
  page: PlaywrightPage,
  box: BoundingBox | null,
  selector: string,
): Promise<string | null> {
  if (!box) return null;
  try {
    const result = (await page.evaluate(
      ((p: { cx: number; cy: number; selector: string }) => {
        const target = document.querySelector(p.selector);
        if (!target) return null;
        const top = skipDmOverlays(document.elementFromPoint(p.cx, p.cy) as HTMLElement | null);
        if (!top) return null;
        if (target === top || target.contains(top) || top.contains(target)) return null;
        return buildHitInfo(top);

        function skipDmOverlays(el: HTMLElement | null): HTMLElement | null {
          let cur = el;
          while (
            cur &&
            (cur.id?.startsWith?.("dm-") ||
              (typeof cur.className === "string" && cur.className.includes("dm-")))
          ) {
            cur = cur.parentElement;
          }
          return cur;
        }

        function buildHitInfo(el: HTMLElement) {
          const style = window.getComputedStyle(el);
          return { tag: el.tagName, id: el.id, className: el.className, zIndex: style.zIndex };
        }
      }) as (...args: unknown[]) => unknown,
      {
        cx: box.x + box.width / 2,
        cy: box.y + box.height / 2,
        selector,
      } as unknown,
    )) as HitTestResult | null;

    if (!result) return null;
    const idPart = result.id ? ` id="${result.id}"` : "";
    const classPart = result.className ? ` class="${result.className}"` : "";
    const msg =
      `Hit-test warning: "${selector}" is obscured by ` +
      `<${result.tag}${idPart}${classPart}> (z-index: ${result.zIndex})`;
    logger.warn(msg);
    return msg;
  } catch {
    return null;
  }
}

/**
 * Pointer-events-none detector (#26).
 *
 * Evaluates `getComputedStyle(element).pointerEvents` on the resolved target.
 * If it is `"none"`, returns a warning. Playwright will silently force-click
 * through it, but the demo is misleading.
 *
 * Never throws — returns null on any error.
 */
export async function checkPointerEvents(
  page: PlaywrightPage,
  selector: string,
): Promise<string | null> {
  try {
    const pointerEvents = (await page.evaluate(
      ((sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        return window.getComputedStyle(el).pointerEvents;
      }) as (...args: unknown[]) => unknown,
      selector as unknown,
    )) as string | null;

    if (pointerEvents === "none") {
      const msg = `Pointer-events warning: "${selector}" has pointer-events: none — Playwright will force-click through it, but the demo is misleading`;
      logger.warn(msg);
      return msg;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Input text readback assertion (#30).
 *
 * After a `type` action, reads back the input value via `locator.inputValue()`
 * and compares against `expected`. If they don't match (input mask, maxlength,
 * controlled component), returns a warning.
 *
 * Never throws — returns null on any error.
 */
export async function checkTypedText(
  page: PlaywrightPage,
  selector: string,
  expected: string,
): Promise<string | null> {
  try {
    const locator = page.locator(selector);
    const actual = await locator.inputValue();
    if (actual !== expected) {
      const msg = `Type readback warning: "${selector}" expected value "${expected}" but got "${actual}"`;
      logger.warn(msg);
      return msg;
    }
    return null;
  } catch {
    return null;
  }
}
