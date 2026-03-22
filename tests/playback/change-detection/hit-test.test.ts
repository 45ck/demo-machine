import { describe, it, expect, vi } from "vitest";
import { HitTestDetector } from "../../../src/playback/change-detection/hit-test.js";
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

describe("HitTestDetector", () => {
  it("passes when element is topmost at center point", async () => {
    const detector = new HitTestDetector();
    const page = createMockPage(() => ({ found: true, hit: true, topTag: "<button#btn>" }));
    const step = { action: "click", selector: "#btn" } as Step;

    await detector.before(page, step);
    const signal = await detector.after(page, step);

    expect(signal.changesDetected).toBe(true);
    expect(signal.confidence).toBe(0);
    expect(signal.details).toBe("element is topmost at center point");
  });

  it("reports when element is obscured by overlay", async () => {
    const detector = new HitTestDetector();
    const page = createMockPage(() => ({
      found: true,
      hit: false,
      topTag: "<div.modal-overlay>",
    }));
    const step = { action: "click", selector: "#btn" } as Step;

    await detector.before(page, step);
    const signal = await detector.after(page, step);

    expect(signal.changesDetected).toBe(true);
    expect(signal.confidence).toBe(0.95);
    expect(signal.details).toContain("obscured by");
    expect(signal.details).toContain("modal-overlay");
  });

  it("reports when element is not found", async () => {
    const detector = new HitTestDetector();
    const page = createMockPage(() => ({ found: false, hit: false, topTag: "" }));
    const step = { action: "click", selector: "#missing" } as Step;

    await detector.before(page, step);
    const signal = await detector.after(page, step);

    expect(signal.changesDetected).toBe(true);
    expect(signal.confidence).toBe(0.9);
    expect(signal.details).toContain("element not found");
    expect(signal.details).toContain("#missing");
  });

  it("always returns changesDetected: true to avoid false NoVisibleChangeError", async () => {
    const detector = new HitTestDetector();

    // Even on a pass, changesDetected should be true
    const page = createMockPage(() => ({ found: true, hit: true, topTag: "<button>" }));
    const step = { action: "click", selector: "#btn" } as Step;

    await detector.before(page, step);
    const signal = await detector.after(page, step);
    expect(signal.changesDetected).toBe(true);

    // Also true when obscured
    const page2 = createMockPage(() => ({ found: true, hit: false, topTag: "<div>" }));
    const signal2 = await detector.after(page2, step);
    expect(signal2.changesDetected).toBe(true);

    // Also true when not found
    const page3 = createMockPage(() => ({ found: false, hit: false, topTag: "" }));
    const signal3 = await detector.after(page3, step);
    expect(signal3.changesDetected).toBe(true);
  });

  it("skips with changesDetected true when step has no selector", async () => {
    const detector = new HitTestDetector();
    const page = createMockPage();
    const step = { action: "scroll", x: 0, y: 200 } as Step;

    await detector.before(page, step);
    const signal = await detector.after(page, step);

    expect(signal.changesDetected).toBe(true);
    expect(signal.confidence).toBe(0);
    expect(signal.details).toBe("skipped (no target selector)");
  });

  it("reports high confidence on failure cases", async () => {
    const detector = new HitTestDetector();

    // Obscured case
    const page = createMockPage(() => ({ found: true, hit: false, topTag: "<div.overlay>" }));
    const step = { action: "click", selector: "#btn" } as Step;
    await detector.before(page, step);
    const signal = await detector.after(page, step);
    expect(signal.confidence).toBeGreaterThanOrEqual(0.9);

    // Not found case
    const page2 = createMockPage(() => ({ found: false, hit: false, topTag: "" }));
    const signal2 = await detector.after(page2, step);
    expect(signal2.confidence).toBeGreaterThanOrEqual(0.9);
  });
});
