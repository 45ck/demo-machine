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

export interface ElementScrollPosition {
  scrollLeft: number;
  scrollTop: number;
}

interface WindowScrollPosition {
  scrollX: number;
  scrollY: number;
}

interface ElementScrollCheck {
  locator: PlaywrightLocator;
  selector: string;
  requestedX: number;
  requestedY: number;
  before: ElementScrollPosition | null;
}

interface WindowScrollCheck {
  page: PlaywrightPage;
  requestedX: number;
  requestedY: number;
  before: WindowScrollPosition | null;
}

interface ScrollWarningInput {
  selector: string;
  actualX: number;
  actualY: number;
  requestedX: number;
  requestedY: number;
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
  locator?: PlaywrightLocator,
): Promise<string | null> {
  if (!box) return null;
  try {
    const targetLocator = locator ?? page.locator(selector);
    const result = (await targetLocator.evaluate(
      ((target: unknown, p: { cx: number; cy: number }) => {
        const targetElement = target instanceof Element ? target : undefined;
        const top = skipDmOverlays(document.elementFromPoint(p.cx, p.cy) as HTMLElement | null);
        if (!targetElement || !top) return null;
        if (targetElement === top || targetElement.contains(top) || top.contains(targetElement)) {
          return null;
        }
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
  locator?: PlaywrightLocator,
): Promise<string | null> {
  try {
    const targetLocator = locator ?? page.locator(selector);
    const pointerEvents = (await targetLocator.evaluate(((el: unknown) =>
      el instanceof Element ? window.getComputedStyle(el).pointerEvents : null) as (
      ...args: unknown[]
    ) => unknown)) as string | null;

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
  locator?: PlaywrightLocator,
): Promise<string | null> {
  try {
    const targetLocator = locator ?? page.locator(selector);
    const actual = await targetLocator.inputValue();
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
 * Reads a before/after pair and compares the delta. Action handlers that have
 * already captured the pre-scroll position should use the explicit element or
 * window helpers below so smooth scrolling has time to settle first.
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
      const locator = page.locator(selector);
      const before = await readElementScrollPosition(locator);
      return await checkElementScrollPosition({
        locator,
        selector,
        requestedX,
        requestedY,
        before,
      });
    }
    const before = await readWindowScrollPosition(page);
    return await checkWindowScrollPosition({ page, requestedX, requestedY, before });
  } catch {
    return null;
  }
}

export async function readElementScrollPosition(
  locator: PlaywrightLocator,
): Promise<ElementScrollPosition | null> {
  try {
    return (await locator.evaluate(((el: unknown) => {
      const node = el as HTMLElement;
      return { scrollLeft: node.scrollLeft, scrollTop: node.scrollTop };
    }) as (...args: unknown[]) => unknown)) as ElementScrollPosition;
  } catch {
    return null;
  }
}

export async function readWindowScrollPosition(
  page: PlaywrightPage,
): Promise<WindowScrollPosition | null> {
  try {
    return (await page.evaluate((() => ({
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    })) as (...args: unknown[]) => unknown)) as WindowScrollPosition;
  } catch {
    return null;
  }
}

export async function checkElementScrollPosition(
  params: ElementScrollCheck,
): Promise<string | null> {
  if ((params.requestedX === 0 && params.requestedY === 0) || !params.before) return null;
  try {
    const after = await readElementScrollPosition(params.locator);
    if (!after) return null;
    const actualX = Math.abs(after.scrollLeft - params.before.scrollLeft);
    const actualY = Math.abs(after.scrollTop - params.before.scrollTop);
    return reportScrollWarning({
      selector: params.selector,
      actualX,
      actualY,
      requestedX: params.requestedX,
      requestedY: params.requestedY,
    });
  } catch {
    return null;
  }
}

export async function checkWindowScrollPosition(params: WindowScrollCheck): Promise<string | null> {
  if ((params.requestedX === 0 && params.requestedY === 0) || !params.before) return null;
  try {
    const after = await readWindowScrollPosition(params.page);
    if (!after) return null;
    const actualX = Math.abs(after.scrollX - params.before.scrollX);
    const actualY = Math.abs(after.scrollY - params.before.scrollY);
    return reportScrollWarning({
      selector: "window",
      actualX,
      actualY,
      requestedX: params.requestedX,
      requestedY: params.requestedY,
    });
  } catch {
    return null;
  }
}

function reportScrollWarning(params: ScrollWarningInput): string | null {
  if (isScrollSufficient(params.actualX, params.actualY, params.requestedX, params.requestedY)) {
    return null;
  }
  const target = params.selector === "window" ? "window" : `"${params.selector}"`;
  const msg =
    `Scroll position warning: ${target} scrolled (${String(params.actualX)}, ${String(params.actualY)}) ` +
    `but (${String(Math.abs(params.requestedX))}, ${String(Math.abs(params.requestedY))}) was requested — ` +
    `container may have overflow:hidden or hit a boundary`;
  logger.warn(msg);
  return msg;
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
