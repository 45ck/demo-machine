import { describe, it, expect, vi } from "vitest";
import { DomMutationDetector } from "../../../src/playback/change-detection/dom-mutation.js";
import type { PlaywrightPage } from "../../../src/playback/actions.js";
import type { Step } from "../../../src/spec/types.js";

function createMockPage(mutationResult?: {
  count: number;
  childList: number;
  attributes: number;
  characterData: number;
}): PlaywrightPage {
  const evaluateFn = vi.fn();
  // First call: before() — sets up the observer (no return needed).
  evaluateFn.mockResolvedValueOnce(undefined);
  // Second call: after() — returns mutation stats.
  evaluateFn.mockResolvedValueOnce(
    mutationResult ?? { count: 0, childList: 0, attributes: 0, characterData: 0 },
  );

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

const clickStep: Step = { action: "click", selector: "#btn" } as Step;

describe("DomMutationDetector", () => {
  it("reports no changes when mutation count is 0", async () => {
    const detector = new DomMutationDetector();
    const page = createMockPage({ count: 0, childList: 0, attributes: 0, characterData: 0 });

    await detector.before(page, clickStep);
    const signal = await detector.after(page, clickStep);

    expect(signal.detector).toBe("dom-mutation");
    expect(signal.changesDetected).toBe(false);
    expect(signal.confidence).toBe(0);
    expect(signal.details).toBe("no DOM mutations observed");
  });

  it("reports changes when mutations are detected", async () => {
    const detector = new DomMutationDetector();
    const page = createMockPage({ count: 5, childList: 2, attributes: 3, characterData: 0 });

    await detector.before(page, clickStep);
    const signal = await detector.after(page, clickStep);

    expect(signal.changesDetected).toBe(true);
    expect(signal.confidence).toBeGreaterThan(0);
    expect(signal.details).toContain("5 DOM mutations");
    expect(signal.details).toContain("2 childList");
    expect(signal.details).toContain("3 attributes");
  });

  it("caps confidence at 1", async () => {
    const detector = new DomMutationDetector();
    const page = createMockPage({ count: 100, childList: 50, attributes: 50, characterData: 0 });

    await detector.before(page, clickStep);
    const signal = await detector.after(page, clickStep);

    expect(signal.confidence).toBe(1);
  });

  it("includes characterData in details", async () => {
    const detector = new DomMutationDetector();
    const page = createMockPage({ count: 1, childList: 0, attributes: 0, characterData: 1 });

    await detector.before(page, clickStep);
    const signal = await detector.after(page, clickStep);

    expect(signal.changesDetected).toBe(true);
    expect(signal.details).toContain("1 characterData");
  });

  it("calls page.evaluate twice (before + after)", async () => {
    const detector = new DomMutationDetector();
    const page = createMockPage();

    await detector.before(page, clickStep);
    await detector.after(page, clickStep);

    expect(page.evaluate).toHaveBeenCalledTimes(2);
  });
});
