import type { PlaywrightPage } from "./playwright.js";

interface LeakedOverlay {
  id: string;
  className: string;
  display: string;
  opacity: string;
}

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
    const leaks = (await page.evaluate((() => {
      const results: Array<{
        id: string;
        className: string;
        display: string;
        opacity: string;
      }> = [];
      const allElements = document.querySelectorAll("*");
      for (const el of Array.from(allElements)) {
        const id = el.id || "";
        const className = typeof el.className === "string" ? el.className : "";
        const isDmElement = id.includes("dm-") || className.includes("dm-");
        if (!isDmElement) continue;

        const style = window.getComputedStyle(el);
        const display = style.display;
        const opacity = style.opacity;

        // Skip hidden overlays (they are properly cleaned up)
        if (display === "none") continue;
        if (parseFloat(opacity) <= 0) continue;

        results.push({ id, className, display, opacity });
      }
      return results;
    }) as (...args: unknown[]) => unknown)) as LeakedOverlay[];

    const warnings: string[] = [];
    for (const leak of leaks) {
      const identifier = leak.id || leak.className;
      const msg = `Overlay leak: "${identifier}" is still visible after playback (display=${leak.display}, opacity=${leak.opacity})`;
      warnings.push(msg);
    }
    return warnings;
  } catch {
    return [];
  }
}
