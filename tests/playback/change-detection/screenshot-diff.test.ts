import { describe, it, expect, vi } from "vitest";
import { ScreenshotDiffDetector } from "../../../src/playback/change-detection/screenshot-diff.js";
import type { PlaywrightPage } from "../../../src/playback/actions.js";
import type { Step } from "../../../src/spec/types.js";

function createMockPage(): PlaywrightPage {
  return {
    evaluate: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    keyboard: { press: vi.fn(), type: vi.fn() },
    waitForTimeout: vi.fn(),
    locator: vi.fn(),
    getByRole: vi.fn(),
    getByText: vi.fn(),
    getByTestId: vi.fn(),
    getByLabel: vi.fn(),
    getByPlaceholder: vi.fn(),
    getByAltText: vi.fn(),
    getByTitle: vi.fn(),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("")),
    addStyleTag: vi.fn(),
    context: vi.fn(),
  };
}

const clickStep: Step = { action: "click", selector: "#btn" } as Step;

describe("ScreenshotDiffDetector", () => {
  it("gracefully handles missing pixelmatch dependency", async () => {
    // Mock dynamic import to simulate missing dependency
    vi.doMock("pixelmatch", () => {
      throw new Error("Cannot find module 'pixelmatch'");
    });
    const { ScreenshotDiffDetector: FreshDetector } =
      await import("../../../src/playback/change-detection/screenshot-diff.js");
    const detector = new FreshDetector();
    const page = createMockPage();

    await detector.setup();
    await detector.before(page, clickStep);
    const signal = await detector.after(page, clickStep);

    expect(signal.detector).toBe("screenshot-diff");
    expect(signal.changesDetected).toBe(false);
    expect(signal.details).toContain("skipped");
    vi.doUnmock("pixelmatch");
  });

  it("has correct name", () => {
    const detector = new ScreenshotDiffDetector();
    expect(detector.name).toBe("screenshot-diff");
  });

  it("accepts custom threshold", () => {
    const detector = new ScreenshotDiffDetector(0.05);
    expect(detector.name).toBe("screenshot-diff");
  });
});
