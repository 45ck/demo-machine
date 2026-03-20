import type { PlaywrightPage } from "../playwright.js";
import type { Step } from "../../spec/types.js";
import type { ChangeDetector, DetectorSignal } from "./types.js";

interface LayoutSnapshot {
  elementCount: number;
  scrollX: number;
  scrollY: number;
  bodyWidth: number;
  bodyHeight: number;
}

function snapshotScript(): LayoutSnapshot {
  return {
    elementCount: document.body.querySelectorAll("*").length,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    bodyWidth: document.body.scrollWidth,
    bodyHeight: document.body.scrollHeight,
  };
}

/**
 * Compares high-level layout metrics (element count, scroll position, body
 * dimensions) before and after an action.
 */
export class LayoutDetector implements ChangeDetector {
  readonly name = "layout";
  private snapshot: LayoutSnapshot | undefined;

  async before(page: PlaywrightPage): Promise<void> {
    this.snapshot = (await page.evaluate(
      snapshotScript as (...args: unknown[]) => unknown,
    )) as LayoutSnapshot;
  }

  async after(page: PlaywrightPage, _step: Step): Promise<DetectorSignal> {
    const after = (await page.evaluate(
      snapshotScript as (...args: unknown[]) => unknown,
    )) as LayoutSnapshot;

    const before = this.snapshot ?? after;
    this.snapshot = undefined;

    const elementDelta = Math.abs(after.elementCount - before.elementCount);
    const scrollDelta =
      Math.abs(after.scrollX - before.scrollX) + Math.abs(after.scrollY - before.scrollY);
    const sizeDelta =
      Math.abs(after.bodyWidth - before.bodyWidth) + Math.abs(after.bodyHeight - before.bodyHeight);

    const changed = elementDelta > 0 || scrollDelta > 0 || sizeDelta > 0;

    const parts: string[] = [];
    if (elementDelta > 0) parts.push(`elementCount \u0394${String(elementDelta)}`);
    if (scrollDelta > 0) parts.push(`scroll \u0394${String(scrollDelta)}px`);
    if (sizeDelta > 0) parts.push(`bodySize \u0394${String(sizeDelta)}px`);

    // Low confidence for tiny scroll changes (e.g. 1px), higher for structural.
    const confidence = changed
      ? Math.min(1, elementDelta * 0.4 + scrollDelta * 0.01 + sizeDelta * 0.01)
      : 0;

    return {
      detector: this.name,
      changesDetected: changed,
      confidence: Math.min(1, Math.max(0, confidence)),
      details: changed ? parts.join(", ") : "no layout changes",
    };
  }
}
