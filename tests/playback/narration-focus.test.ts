import { describe, expect, it, vi } from "vitest";
import { prepareNarrationFocus } from "../../src/playback/narration-focus.js";
import type { PlaywrightLocator, PlaywrightPage } from "../../src/playback/playwright.js";
import type { Step } from "../../src/spec/types.js";

function pageWithLocator(locator: PlaywrightLocator): PlaywrightPage {
  return { locator: vi.fn().mockReturnValue(locator) } as unknown as PlaywrightPage;
}

describe("prepareNarrationFocus", () => {
  it("allows page-level narrated steps without an element focus target", async () => {
    const page = pageWithLocator({} as PlaywrightLocator);
    const step = {
      action: "wait",
      ms: 500,
      narration: "The page remains visible while the workflow settles.",
    } as Step;

    await expect(
      prepareNarrationFocus({
        page,
        step,
        focus: {
          enabled: true,
          cursor: true,
          highlight: true,
          zoom: false,
          scale: 1.12,
          durationMs: 1200,
          transitionMs: 350,
        },
        moveCursorTo: vi.fn().mockResolvedValue(undefined),
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a narrated target with no visible bounding box", async () => {
    const locator = {
      waitFor: vi.fn().mockResolvedValue(undefined),
      scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      boundingBox: vi.fn().mockResolvedValue(null),
    } as unknown as PlaywrightLocator;
    const page = pageWithLocator(locator);
    const step = {
      action: "click",
      selector: "#missing-box",
      narration: "Click the visible control.",
    } as Step;

    await expect(
      prepareNarrationFocus({
        page,
        step,
        focus: {
          enabled: true,
          cursor: true,
          highlight: true,
          zoom: false,
          scale: 1.12,
          durationMs: 1200,
          transitionMs: 350,
        },
        moveCursorTo: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow("Unable to present narration focus for #missing-box");
  });
});
