import { describe, it, expect, vi } from "vitest";
import { detectOverlayLeaks } from "../../src/playback/overlay-leak-detector.js";
import type { PlaywrightPage } from "../../src/playback/playwright.js";

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

describe("detectOverlayLeaks", () => {
  it("returns empty array when no dm- overlays exist", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const result = await detectOverlayLeaks(page);
    expect(result).toEqual([]);
  });

  it("returns warnings for visible dm- overlay elements", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "dm-cursor",
        className: "",
        display: "block",
        visibility: "visible",
        opacity: "1",
        width: 24,
        height: 24,
      },
      {
        id: "dm-focus-ring",
        className: "",
        display: "block",
        visibility: "visible",
        opacity: "0.5",
        width: 120,
        height: 40,
      },
    ]);
    const result = await detectOverlayLeaks(page);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("dm-cursor");
    expect(result[1]).toContain("dm-focus-ring");
  });

  it("does not report dm- overlays that are hidden (display: none)", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const result = await detectOverlayLeaks(page);
    expect(result).toEqual([]);
  });

  it("does not report dm- overlays that have opacity 0", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const result = await detectOverlayLeaks(page);
    expect(result).toEqual([]);
  });

  it("reports overlays found by class name containing dm-", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "",
        className: "dm-ripple",
        display: "block",
        visibility: "visible",
        opacity: "1",
        width: 16,
        height: 16,
      },
    ]);
    const result = await detectOverlayLeaks(page);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("dm-ripple");
  });

  it("does not throw when page.evaluate throws", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("page closed"));
    const result = await detectOverlayLeaks(page);
    expect(result).toEqual([]);
  });

  it("includes display and opacity in the warning message", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "dm-spotlight",
        className: "",
        display: "block",
        visibility: "visible",
        opacity: "0.8",
        width: 640,
        height: 360,
      },
    ]);
    const result = await detectOverlayLeaks(page);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("dm-spotlight");
    expect(result[0]).toContain("display=block");
    expect(result[0]).toContain("visibility=visible");
    expect(result[0]).toContain("opacity=0.8");
    expect(result[0]).toContain("size=640x360");
  });
});
