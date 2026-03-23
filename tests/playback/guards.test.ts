import { describe, it, expect, vi } from "vitest";
import { checkHitTest, checkPointerEvents, checkTypedText } from "../../src/playback/guards.js";
import type { PlaywrightPage } from "../../src/playback/playwright.js";
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
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await checkHitTest(page, box, "#btn");
    expect(result).toBeNull();
  });

  it("returns a warning when a different element obscures the target", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
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

  it("does not throw when page.evaluate throws", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("detached"));
    const result = await checkHitTest(page, box, "#btn");
    expect(result).toBeNull();
  });
});

describe("checkPointerEvents", () => {
  it("returns null when pointer-events is not 'none'", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue("auto");
    const result = await checkPointerEvents(page, "#btn");
    expect(result).toBeNull();
  });

  it("returns a warning when pointer-events is 'none'", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue("none");
    const result = await checkPointerEvents(page, "#btn");
    expect(result).not.toBeNull();
    expect(result).toContain("#btn");
    expect(result).toContain("pointer-events: none");
  });

  it("does not throw when page.evaluate throws", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("frame detached"));
    const result = await checkPointerEvents(page, "#btn");
    expect(result).toBeNull();
  });

  it("returns null when pointer-events is empty string", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue("");
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

  it("returns null for empty expected text", async () => {
    const page = createMockPage();
    const locator = (page.locator as ReturnType<typeof vi.fn>)("input");
    locator.inputValue.mockResolvedValue("");
    const result = await checkTypedText(page, "#input", "");
    expect(result).toBeNull();
  });
});
