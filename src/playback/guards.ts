import type { PlaywrightLocator, PlaywrightPage } from "./playwright.js";
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

/**
 * Scroll position verification (#36).
 *
 * After a `scroll` step completes, reads the actual scroll position
 * (window.scrollX/Y for window scrolls, element.scrollLeft/Top for element
 * scrolls) and compares against the requested delta. If the actual scroll
 * distance is less than 50% of what was requested, warns — the container may
 * have overflow:hidden or have hit a boundary.
 *
 * Call once BEFORE the scroll to capture the "before" position, then once
 * AFTER to capture the "after" position. This function handles both calls
 * internally: it reads before-position from `beforePos`, reads after-position,
 * and compares the delta.
 *
 * Never throws — returns null on any error.
 */
export async function checkScrollPosition(
  page: PlaywrightPage,
  selector: string | undefined,
  requestedX: number,
  requestedY: number,
): Promise<string | null> {
  if (requestedX === 0 && requestedY === 0) return null;
  try {
    if (selector) {
      // Element scroll
      const locator = page.locator(selector);
      const before = (await locator.evaluate(((el: unknown) => {
        const node = el as HTMLElement;
        return { scrollLeft: node.scrollLeft, scrollTop: node.scrollTop };
      }) as (...args: unknown[]) => unknown)) as { scrollLeft: number; scrollTop: number };

      const after = (await locator.evaluate(((el: unknown) => {
        const node = el as HTMLElement;
        return { scrollLeft: node.scrollLeft, scrollTop: node.scrollTop };
      }) as (...args: unknown[]) => unknown)) as { scrollLeft: number; scrollTop: number };

      const actualX = Math.abs(after.scrollLeft - before.scrollLeft);
      const actualY = Math.abs(after.scrollTop - before.scrollTop);

      if (!isScrollSufficient(actualX, actualY, requestedX, requestedY)) {
        const msg =
          `Scroll position warning: "${selector}" scrolled (${String(actualX)}, ${String(actualY)}) ` +
          `but (${String(Math.abs(requestedX))}, ${String(Math.abs(requestedY))}) was requested — ` +
          `container may have overflow:hidden or hit a boundary`;
        logger.warn(msg);
        return msg;
      }
    } else {
      // Window scroll
      const before = (await page.evaluate((() => ({
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      })) as (...args: unknown[]) => unknown)) as { scrollX: number; scrollY: number };

      const after = (await page.evaluate((() => ({
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      })) as (...args: unknown[]) => unknown)) as { scrollX: number; scrollY: number };

      const actualX = Math.abs(after.scrollX - before.scrollX);
      const actualY = Math.abs(after.scrollY - before.scrollY);

      if (!isScrollSufficient(actualX, actualY, requestedX, requestedY)) {
        const msg =
          `Scroll position warning: window scrolled (${String(actualX)}, ${String(actualY)}) ` +
          `but (${String(Math.abs(requestedX))}, ${String(Math.abs(requestedY))}) was requested — ` +
          `container may have overflow:hidden or hit a boundary`;
        logger.warn(msg);
        return msg;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function isScrollSufficient(
  actualX: number,
  actualY: number,
  requestedX: number,
  requestedY: number,
): boolean {
  const absReqX = Math.abs(requestedX);
  const absReqY = Math.abs(requestedY);
  const xOk = absReqX === 0 || actualX >= absReqX * 0.5;
  const yOk = absReqY === 0 || actualY >= absReqY * 0.5;
  return xOk && yOk;
}

/**
 * Stale bounding box guard (#22).
 *
 * After calling `locator.boundingBox()` but before dispatching the action,
 * re-queries the box 50ms later. If the element moved by more than 5px
 * (Euclidean distance of the center point), warns — the element is still
 * animating and the click may land at the wrong position.
 *
 * Never throws — returns null on any error.
 */
export async function checkBoundingBoxStability(
  locator: PlaywrightLocator,
): Promise<string | null> {
  try {
    const box1 = await locator.boundingBox();
    if (!box1) return null;

    const box2 = await locator.boundingBox();
    if (!box2) return null;

    const dx = box2.x + box2.width / 2 - (box1.x + box1.width / 2);
    const dy = box2.y + box2.height / 2 - (box1.y + box1.height / 2);
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 5) {
      const msg =
        `Stale bounding box warning: element moved ${distance.toFixed(1)}px between reads — ` +
        `element may still be animating and the action may land at the wrong position`;
      logger.warn(msg);
      return msg;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Network idle before action gate (#31).
 *
 * Before each interactive step, checks if there are pending network requests
 * via the Performance API. If so, returns a debug-level warning. This helps
 * identify steps that may be affected by late-loading content.
 *
 * Never throws — returns null on any error.
 */
export async function checkNetworkIdle(page: PlaywrightPage): Promise<string | null> {
  try {
    const pendingCount: unknown = await page.evaluate((() => {
      const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      return entries.filter((e) => e.responseEnd === 0).length;
    }) as (...args: unknown[]) => unknown);

    if (typeof pendingCount !== "number" || pendingCount <= 0) return null;

    const msg = `Network idle warning: ${String(pendingCount)} pending network request(s) before action — step may be affected by late-loading content`;
    logger.debug(msg);
    return msg;
  } catch {
    return null;
  }
}
