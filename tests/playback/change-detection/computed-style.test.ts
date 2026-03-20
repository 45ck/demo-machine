import { describe, it, expect, vi } from "vitest";
import { ComputedStyleDetector } from "../../../src/playback/change-detection/computed-style.js";
import type { PlaywrightPage } from "../../../src/playback/actions.js";
import type { Step } from "../../../src/spec/types.js";

function createMockPage(
  beforeStyles: Record<string, string> | null,
  afterStyles: Record<string, string> | null,
): PlaywrightPage {
  const evaluateFn = vi.fn();
  evaluateFn.mockResolvedValueOnce(beforeStyles);
  evaluateFn.mockResolvedValueOnce(afterStyles);

  return {
    evaluate: evaluateFn,
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
    screenshot: vi.fn(),
    addStyleTag: vi.fn(),
    context: vi.fn(),
  };
}

const baseStyles: Record<string, string> = {
  display: "block",
  visibility: "visible",
  opacity: "1",
  width: "200px",
  height: "40px",
  color: "rgb(0, 0, 0)",
  backgroundColor: "rgb(255, 255, 255)",
  transform: "none",
  position: "relative",
};

describe("ComputedStyleDetector", () => {
  it("reports no changes when styles are identical", async () => {
    const detector = new ComputedStyleDetector();
    const step: Step = { action: "click", selector: "#btn" } as Step;
    const page = createMockPage(baseStyles, baseStyles);

    await detector.before(page, step);
    const signal = await detector.after(page, step);

    expect(signal.detector).toBe("computed-style");
    expect(signal.changesDetected).toBe(false);
    expect(signal.details).toBe("no computed style changes");
  });

  it("detects style changes", async () => {
    const detector = new ComputedStyleDetector();
    const step: Step = { action: "click", selector: "#btn" } as Step;
    const changed = { ...baseStyles, backgroundColor: "rgb(0, 128, 255)", opacity: "0.5" };
    const page = createMockPage(baseStyles, changed);

    await detector.before(page, step);
    const signal = await detector.after(page, step);

    expect(signal.changesDetected).toBe(true);
    expect(signal.details).toContain("backgroundColor");
    expect(signal.details).toContain("opacity");
  });

  it("skips when step has no selector", async () => {
    const detector = new ComputedStyleDetector();
    // dragAndDrop has no top-level selector
    const step: Step = {
      action: "dragAndDrop",
      from: { selector: "#a" },
      to: { selector: "#b" },
    } as Step;
    const page = createMockPage(null, null);

    await detector.before(page, step);
    const signal = await detector.after(page, step);

    expect(signal.changesDetected).toBe(false);
    expect(signal.details).toContain("skipped");
    // Should not call evaluate when skipped
    expect(page.evaluate).not.toHaveBeenCalled();
  });

  it("handles element not found (null from evaluate)", async () => {
    const detector = new ComputedStyleDetector();
    const step: Step = { action: "click", selector: "#missing" } as Step;
    // Both before and after return null (element not found on page)
    const page = createMockPage(null, null);

    await detector.before(page, step);
    const signal = await detector.after(page, step);

    expect(signal.changesDetected).toBe(false);
    // When before snapshot is null (element missing), after gets "could not capture styles"
    expect(signal.details).toBe("could not capture styles");
  });
});
