import { describe, it, expect, vi } from "vitest";
import { LayoutDetector } from "../../../src/playback/change-detection/layout.js";
import type { PlaywrightPage } from "../../../src/playback/actions.js";
import type { Step } from "../../../src/spec/types.js";

function createMockPage(
  beforeSnapshot: Record<string, number>,
  afterSnapshot: Record<string, number>,
): PlaywrightPage {
  const evaluateFn = vi.fn();
  evaluateFn.mockResolvedValueOnce(beforeSnapshot);
  evaluateFn.mockResolvedValueOnce(afterSnapshot);

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

const base = { elementCount: 100, scrollX: 0, scrollY: 0, bodyWidth: 1920, bodyHeight: 3000 };
const clickStep: Step = { action: "click", selector: "#btn" } as Step;

describe("LayoutDetector", () => {
  it("reports no changes when snapshots are identical", async () => {
    const detector = new LayoutDetector();
    const page = createMockPage(base, base);

    await detector.before(page, clickStep);
    const signal = await detector.after(page, clickStep);

    expect(signal.detector).toBe("layout");
    expect(signal.changesDetected).toBe(false);
    expect(signal.details).toBe("no layout changes");
  });

  it("detects element count change", async () => {
    const detector = new LayoutDetector();
    const after = { ...base, elementCount: 105 };
    const page = createMockPage(base, after);

    await detector.before(page, clickStep);
    const signal = await detector.after(page, clickStep);

    expect(signal.changesDetected).toBe(true);
    expect(signal.details).toContain("elementCount");
  });

  it("detects scroll change", async () => {
    const detector = new LayoutDetector();
    const after = { ...base, scrollY: 200 };
    const page = createMockPage(base, after);

    await detector.before(page, clickStep);
    const signal = await detector.after(page, clickStep);

    expect(signal.changesDetected).toBe(true);
    expect(signal.details).toContain("scroll");
  });

  it("detects body size change", async () => {
    const detector = new LayoutDetector();
    const after = { ...base, bodyHeight: 4000 };
    const page = createMockPage(base, after);

    await detector.before(page, clickStep);
    const signal = await detector.after(page, clickStep);

    expect(signal.changesDetected).toBe(true);
    expect(signal.details).toContain("bodySize");
  });

  it("confidence is capped at 1", async () => {
    const detector = new LayoutDetector();
    const after = { ...base, elementCount: 500, scrollY: 9999, bodyHeight: 99999 };
    const page = createMockPage(base, after);

    await detector.before(page, clickStep);
    const signal = await detector.after(page, clickStep);

    expect(signal.confidence).toBeLessThanOrEqual(1);
    expect(signal.confidence).toBeGreaterThan(0);
  });
});
