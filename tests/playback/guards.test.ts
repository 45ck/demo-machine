import { describe, it, expect, vi } from "vitest";
import {
  checkHitTest,
  checkPointerEvents,
  checkTypedText,
  checkScrollPosition,
  checkElementScrollPosition,
  checkWindowScrollPosition,
  checkBoundingBoxStability,
  checkNetworkIdle,
} from "../../src/playback/guards.js";
import type { PlaywrightLocator, PlaywrightPage } from "../../src/playback/playwright.js";
import type { BoundingBox } from "../../src/playback/types.js";

function createMockPage(evaluateResult?: unknown): PlaywrightPage {
  const locator = {
    nth: vi.fn().mockReturnThis(),
    click: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    setChecked: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(undefined),
    setInputFiles: vi.fn().mockResolvedValue(undefined),
    dragTo: vi.fn().mockResolvedValue(undefined),
    isVisible: vi.fn().mockResolvedValue(true),
    textContent: vi.fn().mockResolvedValue("hello"),
    boundingBox: vi.fn().mockResolvedValue({ x: 10, y: 20, width: 100, height: 50 }),
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(evaluateResult ?? undefined),
    inputValue: vi.fn().mockResolvedValue(""),
  };
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    goBack: vi.fn().mockResolvedValue(null),
    goForward: vi.fn().mockResolvedValue(null),
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
    },
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn().mockReturnValue(locator),
    getByRole: vi.fn().mockReturnValue(locator),
    getByText: vi.fn().mockReturnValue(locator),
    getByTestId: vi.fn().mockReturnValue(locator),
    getByLabel: vi.fn().mockReturnValue(locator),
    getByPlaceholder: vi.fn().mockReturnValue(locator),
    getByAltText: vi.fn().mockReturnValue(locator),
    getByTitle: vi.fn().mockReturnValue(locator),
    evaluate: vi.fn().mockResolvedValue(evaluateResult ?? undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("")),
    addStyleTag: vi.fn().mockResolvedValue(undefined),
    context: vi.fn(() => ({ addCookies: vi.fn().mockResolvedValue(undefined) })),
  } as unknown as PlaywrightPage;
}

describe("checkHitTest", () => {
  const box: BoundingBox = { x: 100, y: 200, width: 80, height: 40 };

  it("returns null when the target element is the topmost element at its center", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("#btn");
    locator.evaluate.mockResolvedValue(null);
    const result = await checkHitTest(page, box, "#btn");
    expect(result).toBeNull();
    expect(page.locator).toHaveBeenCalledWith("#btn");
  });

  it("uses the resolved locator when provided", async () => {
    const page = createMockPage();
    const locator = {
      evaluate: vi.fn().mockResolvedValue(null),
    } as unknown as PlaywrightLocator;

    const result = await checkHitTest(page, box, ".start-cta", locator);

    expect(result).toBeNull();
    expect(locator.evaluate).toHaveBeenCalled();
    expect(page.evaluate).not.toHaveBeenCalled();
  });

  it("returns a warning when a different element obscures the target", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("#btn");
    locator.evaluate.mockResolvedValue({
      tag: "DIV",
      id: "modal-overlay",
      className: "modal-backdrop",
      zIndex: "1000",
    });
    const result = await checkHitTest(page, box, "#btn");
    expect(result).not.toBeNull();
    expect(result).toContain("#btn");
    expect(result).toContain("DIV");
    expect(result).toContain("modal-overlay");
    expect(result).toContain("modal-backdrop");
    expect(result).toContain("1000");
  });

  it("returns null when bounding box is null", async () => {
    const page = createMockPage();
    const result = await checkHitTest(page, null as unknown as BoundingBox, "#btn");
    expect(result).toBeNull();
  });

  it("does not throw when locator.evaluate throws", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("#btn");
    locator.evaluate.mockRejectedValue(new Error("detached"));
    const result = await checkHitTest(page, box, "#btn");
    expect(result).toBeNull();
  });
});

describe("checkPointerEvents", () => {
  it("returns null when pointer-events is not 'none'", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("#btn");
    locator.evaluate.mockResolvedValue("auto");
    const result = await checkPointerEvents(page, "#btn");
    expect(result).toBeNull();
  });

  it("returns a warning when pointer-events is 'none'", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("#btn");
    locator.evaluate.mockResolvedValue("none");
    const result = await checkPointerEvents(page, "#btn");
    expect(result).not.toBeNull();
    expect(result).toContain("#btn");
    expect(result).toContain("pointer-events: none");
  });

  it("uses the resolved locator when provided", async () => {
    const page = createMockPage();
    const locator = {
      evaluate: vi.fn().mockResolvedValue("auto"),
    } as unknown as PlaywrightLocator;

    const result = await checkPointerEvents(page, ".start-cta", locator);

    expect(result).toBeNull();
    expect(locator.evaluate).toHaveBeenCalled();
    expect(page.locator).not.toHaveBeenCalled();
  });

  it("does not throw when page.evaluate throws", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("#btn");
    locator.evaluate.mockRejectedValue(new Error("frame detached"));
    const result = await checkPointerEvents(page, "#btn");
    expect(result).toBeNull();
  });

  it("returns null when pointer-events is empty string", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("#btn");
    locator.evaluate.mockResolvedValue("");
    const result = await checkPointerEvents(page, "#btn");
    expect(result).toBeNull();
  });
});

describe("checkTypedText", () => {
  it("returns null when typed text matches expected", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("input");
    locator.inputValue.mockResolvedValue("hello");
    const result = await checkTypedText(page, "#input", "hello");
    expect(result).toBeNull();
  });

  it("returns a warning when typed text does not match expected", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("input");
    locator.inputValue.mockResolvedValue("hel");
    const result = await checkTypedText(page, "#input", "hello");
    expect(result).not.toBeNull();
    expect(result).toContain("#input");
    expect(result).toContain("hello");
    expect(result).toContain("hel");
  });

  it("detects input mask truncation (maxlength)", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("input");
    locator.inputValue.mockResolvedValue("123-45");
    const result = await checkTypedText(page, "#ssn", "123-456-7890");
    expect(result).not.toBeNull();
    expect(result).toContain("123-456-7890");
    expect(result).toContain("123-45");
  });

  it("does not throw when locator.inputValue throws", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("input");
    locator.inputValue.mockRejectedValue(new Error("element detached"));
    const result = await checkTypedText(page, "#input", "test");
    expect(result).toBeNull();
  });

  it("uses the resolved locator when provided", async () => {
    const page = createMockPage();
    const locator = {
      inputValue: vi.fn().mockResolvedValue("hello"),
    } as unknown as PlaywrightLocator;

    const result = await checkTypedText(page, "#input", "hello", locator);

    expect(result).toBeNull();
    expect(locator.inputValue).toHaveBeenCalled();
    expect(page.locator).not.toHaveBeenCalled();
  });

  it("returns null for empty expected text", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("input");
    locator.inputValue.mockResolvedValue("");
    const result = await checkTypedText(page, "#input", "");
    expect(result).toBeNull();
  });
});

describe("checkScrollPosition (#36)", () => {
  it("returns null when actual scroll matches requested (window scroll)", async () => {
    const page = createMockPage();
    // First call: read scrollX/Y before scroll; Second call: read after scroll
    (page.evaluate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ scrollX: 0, scrollY: 0 }) // before
      .mockResolvedValueOnce({ scrollX: 0, scrollY: 300 }); // after
    const result = await checkScrollPosition(page, undefined, 0, 300);
    expect(result).toBeNull();
  });

  it("returns a warning when actual scroll is less than 50% of requested (window scroll)", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ scrollX: 0, scrollY: 0 }) // before
      .mockResolvedValueOnce({ scrollX: 0, scrollY: 40 }); // after — only 40 of 300 requested
    const result = await checkScrollPosition(page, undefined, 0, 300);
    expect(result).not.toBeNull();
    expect(result).toContain("Scroll position warning");
    expect(result).toContain("window");
  });

  it("returns null when actual scroll is exactly 50% of requested", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ scrollX: 0, scrollY: 0 })
      .mockResolvedValueOnce({ scrollX: 0, scrollY: 150 }); // 150 of 300 = 50%
    const result = await checkScrollPosition(page, undefined, 0, 300);
    expect(result).toBeNull();
  });

  it("returns a warning for element scroll with insufficient movement", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)(".container");
    // Element scroll: evaluate on the locator
    locator.evaluate
      .mockResolvedValueOnce({ scrollLeft: 0, scrollTop: 100 }) // before
      .mockResolvedValueOnce({ scrollLeft: 0, scrollTop: 110 }); // after — only 10 of 200
    const result = await checkScrollPosition(page, ".container", 0, 200);
    expect(result).not.toBeNull();
    expect(result).toContain("Scroll position warning");
    expect(result).toContain(".container");
  });

  it("returns null when element scroll achieves requested distance", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)(".container");
    locator.evaluate
      .mockResolvedValueOnce({ scrollLeft: 50, scrollTop: 100 })
      .mockResolvedValueOnce({ scrollLeft: 50, scrollTop: 400 }); // 300 of 300 = 100%
    const result = await checkScrollPosition(page, ".container", 0, 300);
    expect(result).toBeNull();
  });

  it("returns null when both x and y are zero (no scroll requested)", async () => {
    const page = createMockPage();
    const result = await checkScrollPosition(page, undefined, 0, 0);
    expect(result).toBeNull();
  });

  it("does not throw when page.evaluate throws", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("frame detached"));
    const result = await checkScrollPosition(page, undefined, 0, 300);
    expect(result).toBeNull();
  });

  it("checks x-axis scroll insufficiency", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ scrollX: 0, scrollY: 0 })
      .mockResolvedValueOnce({ scrollX: 20, scrollY: 0 }); // 20 of 200 requested x
    const result = await checkScrollPosition(page, undefined, 200, 0);
    expect(result).not.toBeNull();
    expect(result).toContain("Scroll position warning");
  });

  it("compares element scroll against a provided before position", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)(".container");
    locator.evaluate.mockResolvedValueOnce({ scrollLeft: 0, scrollTop: 260 });

    const result = await checkElementScrollPosition({
      locator,
      selector: ".container",
      requestedX: 0,
      requestedY: 200,
      before: {
        scrollLeft: 0,
        scrollTop: 100,
      },
    });

    expect(result).toBeNull();
  });

  it("warns when provided element before position shows insufficient movement", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)(".container");
    locator.evaluate.mockResolvedValueOnce({ scrollLeft: 0, scrollTop: 130 });

    const result = await checkElementScrollPosition({
      locator,
      selector: ".container",
      requestedX: 0,
      requestedY: 200,
      before: {
        scrollLeft: 0,
        scrollTop: 100,
      },
    });

    expect(result).not.toBeNull();
    expect(result).toContain(".container");
  });

  it("compares window scroll against a provided before position", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ scrollX: 0, scrollY: 360 });

    const result = await checkWindowScrollPosition({
      page,
      requestedX: 0,
      requestedY: 300,
      before: { scrollX: 0, scrollY: 100 },
    });

    expect(result).toBeNull();
  });
});

describe("checkBoundingBoxStability (#22)", () => {
  it("returns null when bounding box is stable (no movement)", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("#btn");
    const stableBox = { x: 100, y: 200, width: 80, height: 40 };
    locator.boundingBox.mockResolvedValue(stableBox);
    const result = await checkBoundingBoxStability(locator);
    expect(result).toBeNull();
  });

  it("returns a warning when element moved more than 5px between reads", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("#btn");
    locator.boundingBox
      .mockResolvedValueOnce({ x: 100, y: 200, width: 80, height: 40 })
      .mockResolvedValueOnce({ x: 120, y: 200, width: 80, height: 40 }); // moved 20px in x
    const result = await checkBoundingBoxStability(locator);
    expect(result).not.toBeNull();
    expect(result).toContain("Stale bounding box warning");
    expect(result).toContain("animating");
  });

  it("returns null when movement is exactly 5px (threshold)", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("#btn");
    locator.boundingBox
      .mockResolvedValueOnce({ x: 100, y: 200, width: 80, height: 40 })
      .mockResolvedValueOnce({ x: 103, y: 204, width: 80, height: 40 }); // dx=3, dy=4, distance=5
    const result = await checkBoundingBoxStability(locator);
    expect(result).toBeNull();
  });

  it("returns a warning when movement exceeds 5px diagonally", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("#btn");
    locator.boundingBox
      .mockResolvedValueOnce({ x: 100, y: 200, width: 80, height: 40 })
      .mockResolvedValueOnce({ x: 104, y: 204, width: 80, height: 40 }); // dx=4, dy=4, distance=~5.66
    const result = await checkBoundingBoxStability(locator);
    expect(result).not.toBeNull();
  });

  it("returns null when first boundingBox returns null", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("#btn");
    locator.boundingBox.mockResolvedValue(null);
    const result = await checkBoundingBoxStability(locator);
    expect(result).toBeNull();
  });

  it("returns null when second boundingBox returns null (element disappeared)", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("#btn");
    locator.boundingBox
      .mockResolvedValueOnce({ x: 100, y: 200, width: 80, height: 40 })
      .mockResolvedValueOnce(null);
    const result = await checkBoundingBoxStability(locator);
    expect(result).toBeNull();
  });

  it("does not throw when boundingBox throws", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("#btn");
    locator.boundingBox.mockRejectedValue(new Error("detached"));
    const result = await checkBoundingBoxStability(locator);
    expect(result).toBeNull();
  });
});

describe("checkNetworkIdle (#31)", () => {
  it("returns null when there are no pending requests", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    const result = await checkNetworkIdle(page);
    expect(result).toBeNull();
  });

  it("returns a debug warning when there are pending requests", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    const result = await checkNetworkIdle(page);
    expect(result).not.toBeNull();
    expect(result).toContain("Network idle warning");
    expect(result).toContain("3");
    expect(result).toContain("pending");
  });

  it("returns null when pending count is zero", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    const result = await checkNetworkIdle(page);
    expect(result).toBeNull();
  });

  it("does not throw when page.evaluate throws", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("context destroyed"));
    const result = await checkNetworkIdle(page);
    expect(result).toBeNull();
  });

  it("returns null when evaluate returns non-number", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await checkNetworkIdle(page);
    expect(result).toBeNull();
  });
});
