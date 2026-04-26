import type { PlaywrightPage } from "./playwright.js";

interface LeakedOverlay {
  id: string;
  className: string;
  display: string;
  opacity: string;
  visibility: string;
  width: number;
  height: number;
}

const readOverlayLeaksInBrowser = (() => {
  const results: LeakedOverlay[] = [];
  const allElements = document.querySelectorAll("*");
  for (const el of Array.from(allElements)) {
    const leak = describeVisibleDemoMachineElement(el);
    if (leak) results.push(leak);
  }
  return results;

  function describeVisibleDemoMachineElement(el: Element): LeakedOverlay | null {
    const id = el.id || "";
    const className = typeof el.className === "string" ? el.className : "";
    if (!isDemoMachineElement(id, className)) return null;

    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (!isVisibleOverlay(style, rect)) return null;

    return {
      id,
      className,
      display: style.display,
      opacity: style.opacity,
      visibility: style.visibility,
      width: rect.width,
      height: rect.height,
    };
  }

  function isDemoMachineElement(id: string, className: string): boolean {
    return id.includes("dm-") || className.includes("dm-");
  }

  function isVisibleOverlay(style: CSSStyleDeclaration, rect: DOMRect): boolean {
    if (style.display === "none") return false;
    if (style.visibility === "hidden" || style.visibility === "collapse") return false;
    if (parseFloat(style.opacity) <= 0) return false;
    return rect.width > 0 && rect.height > 0;
  }
}) as (...args: unknown[]) => unknown;

/**
 * Orphaned overlay leak detector (#37).
 *
 * After all chapters complete (post-playback), scans the DOM for any
 * demo-machine overlay elements that are still visible. Checks for elements
 * with id/class containing `dm-` that have `display !== 'none'` and
 * `opacity > 0`.
 *
 * Never throws — returns empty array on any error.
 */
export async function detectOverlayLeaks(page: PlaywrightPage): Promise<string[]> {
  try {
    const leaks = (await page.evaluate(readOverlayLeaksInBrowser)) as LeakedOverlay[];

    const warnings: string[] = [];
    for (const leak of leaks) {
      const identifier = leak.id || leak.className;
      const msg =
        `Overlay leak: "${identifier}" is still visible after playback ` +
        `(display=${leak.display}, visibility=${leak.visibility}, opacity=${leak.opacity}, ` +
        `size=${String(leak.width)}x${String(leak.height)})`;
      warnings.push(msg);
    }
    return warnings;
  } catch {
    return [];
  }
}
