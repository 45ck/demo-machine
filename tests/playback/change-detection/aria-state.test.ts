import { describe, it, expect, vi } from "vitest";
import { AriaStateDetector } from "../../../src/playback/change-detection/aria-state.js";
import type { PlaywrightPage } from "../../../src/playback/playwright.js";
import type { Step } from "../../../src/spec/types.js";

function createMockPage(evaluateImpl?: (...args: unknown[]) => unknown): PlaywrightPage {
  return {
    evaluate: vi.fn().mockImplementation(evaluateImpl ?? (() => ({}))),
    goto: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    keyboard: { press: vi.fn(), type: vi.fn() },
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
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

describe("AriaStateDetector", () => {
  it("detects state changes when ARIA attributes differ", async () => {
    const detector = new AriaStateDetector();
    let callCount = 0;
    const page = createMockPage(() => {
      callCount++;
      if (callCount === 1) {
        return { "aria-expanded": "false", "aria-checked": null, role: "button", disabled: null };
      }
      return { "aria-expanded": "true", "aria-checked": null, role: "button", disabled: null };
    });
    const step = { action: "click", selector: "#toggle" } as Step;

    await detector.before(page, step);
    const signal = await detector.after(page, step);

    expect(signal.changesDetected).toBe(true);
    expect(signal.confidence).toBeGreaterThan(0);
    expect(signal.details).toContain("aria-expanded");
  });

  it("reports no changes when attributes are unchanged", async () => {
    const detector = new AriaStateDetector();
    const snapshot = {
      "aria-expanded": "true",
      "aria-checked": null,
      role: "button",
      disabled: null,
    };
    const page = createMockPage(() => ({ ...snapshot }));
    const step = { action: "click", selector: "#btn" } as Step;

    await detector.before(page, step);
    const signal = await detector.after(page, step);

    expect(signal.changesDetected).toBe(false);
    expect(signal.confidence).toBe(0);
    expect(signal.details).toBe("no ARIA state changes");
  });

  it("handles element not found gracefully", async () => {
    const detector = new AriaStateDetector();
    const page = createMockPage(() => null);
    const step = { action: "click", selector: "#missing" } as Step;

    await detector.before(page, step);
    const signal = await detector.after(page, step);

    expect(signal.changesDetected).toBe(false);
    expect(signal.confidence).toBe(0);
    expect(signal.details).toBe("could not capture ARIA state");
  });

  it("skips silently when step has no selector", async () => {
    const detector = new AriaStateDetector();
    const page = createMockPage();
    const step = { action: "scroll", x: 0, y: 200 } as Step;

    await detector.before(page, step);
    const signal = await detector.after(page, step);

    expect(signal.changesDetected).toBe(false);
    expect(signal.confidence).toBe(0);
    expect(signal.details).toBe("skipped (no target selector)");
    expect(page.evaluate).not.toHaveBeenCalled();
  });

  it("caps confidence at 1.0 even with many changes", async () => {
    const detector = new AriaStateDetector();
    let callCount = 0;
    const page = createMockPage(() => {
      callCount++;
      if (callCount === 1) {
        return {
          "aria-checked": "false",
          "aria-expanded": "false",
          "aria-selected": "false",
          "aria-pressed": "false",
          "aria-hidden": "true",
          role: "button",
          disabled: null,
        };
      }
      return {
        "aria-checked": "true",
        "aria-expanded": "true",
        "aria-selected": "true",
        "aria-pressed": "true",
        "aria-hidden": "false",
        role: "checkbox",
        disabled: "true",
      };
    });
    const step = { action: "click", selector: "#multi" } as Step;

    await detector.before(page, step);
    const signal = await detector.after(page, step);

    expect(signal.changesDetected).toBe(true);
    expect(signal.confidence).toBeLessThanOrEqual(1);
  });

  it("detects multiple attribute changes and lists them all", async () => {
    const detector = new AriaStateDetector();
    let callCount = 0;
    const page = createMockPage(() => {
      callCount++;
      if (callCount === 1) {
        return { "aria-checked": "false", "aria-expanded": "false", role: "checkbox" };
      }
      return { "aria-checked": "true", "aria-expanded": "true", role: "checkbox" };
    });
    const step = { action: "click", selector: "#cb" } as Step;

    await detector.before(page, step);
    const signal = await detector.after(page, step);

    expect(signal.changesDetected).toBe(true);
    expect(signal.details).toContain("aria-checked");
    expect(signal.details).toContain("aria-expanded");
    expect(signal.details).toMatch(/^2 ARIA changes/);
  });
});
