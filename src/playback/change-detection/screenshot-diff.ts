import type { PlaywrightPage } from "../playwright.js";
import type { Step } from "../../spec/types.js";
import type { ChangeDetector, DetectorSignal } from "./types.js";

/**
 * Takes a full-page screenshot before and after each action, then compares
 * pixel buffers.  Requires the `pixelmatch` and `pngjs` packages at runtime;
 * if they are not installed the detector gracefully degrades to a no-op.
 *
 * **Not included in the default detector set** — opt-in via config because of
 * the external dependency and ~100–150 ms per-step cost.
 */
export class ScreenshotDiffDetector implements ChangeDetector {
  readonly name = "screenshot-diff";
  private threshold: number;
  private beforeBuffer: Buffer | undefined;
  private available = true;

  constructor(threshold = 0.001) {
    this.threshold = threshold;
  }

  async setup(): Promise<void> {
    try {
      await import("pixelmatch" as string);
      await import("pngjs" as string);
    } catch {
      this.available = false;
    }
  }

  async before(page: PlaywrightPage): Promise<void> {
    if (!this.available) return;
    this.beforeBuffer = await takeScreenshot(page);
  }

  async after(page: PlaywrightPage, _step: Step): Promise<DetectorSignal> {
    if (!this.available || !this.beforeBuffer) {
      return {
        detector: this.name,
        changesDetected: false,
        confidence: 0,
        details: "skipped (pixelmatch/pngjs not installed)",
      };
    }

    const afterBuffer = await takeScreenshot(page);
    const beforeBuf = this.beforeBuffer;
    this.beforeBuffer = undefined;

    try {
      const { default: pixelmatch } = (await import("pixelmatch" as string)) as {
        default: (
          img1: Uint8Array,
          img2: Uint8Array,
          output: null,
          width: number,
          height: number,
          options: { threshold: number },
        ) => number;
      };
      const { PNG } = (await import("pngjs" as string)) as {
        PNG: {
          sync: { read: (buf: Buffer) => { data: Uint8Array; width: number; height: number } };
        };
      };

      const imgBefore = PNG.sync.read(beforeBuf);
      const imgAfter = PNG.sync.read(afterBuffer);

      if (imgBefore.width !== imgAfter.width || imgBefore.height !== imgAfter.height) {
        return {
          detector: this.name,
          changesDetected: true,
          confidence: 1,
          details: "viewport dimensions changed between screenshots",
        };
      }

      const totalPixels = imgBefore.width * imgBefore.height;
      const diffCount = pixelmatch(
        imgBefore.data,
        imgAfter.data,
        null,
        imgBefore.width,
        imgBefore.height,
        { threshold: 0.1 },
      );

      const ratio = totalPixels > 0 ? diffCount / totalPixels : 0;
      const changed = ratio > this.threshold;

      return {
        detector: this.name,
        changesDetected: changed,
        confidence: Math.min(1, ratio * 100),
        details: changed
          ? `${String(diffCount)} pixels differ (${(ratio * 100).toFixed(3)}%)`
          : `pixel diff ratio ${(ratio * 100).toFixed(3)}% below threshold ${String(this.threshold * 100)}%`,
      };
    } catch (err) {
      return {
        detector: this.name,
        changesDetected: false,
        confidence: 0,
        details: `comparison failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

async function takeScreenshot(page: PlaywrightPage): Promise<Buffer> {
  // Hide dm-* overlay elements for a clean capture.
  await page.evaluate((() => {
    for (const el of document.querySelectorAll('[id^="dm-"], .dm-overlay')) {
      (el as HTMLElement).style.visibility = "hidden";
    }
  }) as (...args: unknown[]) => unknown);

  const buf = await page.screenshot();

  await page.evaluate((() => {
    for (const el of document.querySelectorAll('[id^="dm-"], .dm-overlay')) {
      (el as HTMLElement).style.visibility = "";
    }
  }) as (...args: unknown[]) => unknown);

  return buf;
}
