import { describe, it, expect, vi } from "vitest";
import {
  checkSelectOverlay,
  checkFilePickerOverlay,
  checkOverlayZIndex,
} from "../../src/playback/overlay-visual-guards.js";
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

// ---------- #4: Select Overlay Visual Snapshot ----------

describe("checkSelectOverlay", () => {
  it("returns null when overlay is present with correct text and bottom-center position", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      exists: true,
      textContent: "Selected: Monthly",
      positionFixed: true,
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "2147483647",
    });
    const result = await checkSelectOverlay(page, "Monthly");
    expect(result).toBeNull();
  });

  it("returns a warning when the overlay element does not exist", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      exists: false,
    });
    const result = await checkSelectOverlay(page, "Monthly");
    expect(result).not.toBeNull();
    expect(result).toContain("not found");
  });

  it("returns a warning when overlay text does not contain the expected option", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      exists: true,
      textContent: "Selected: Yearly",
      positionFixed: true,
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "2147483647",
    });
    const result = await checkSelectOverlay(page, "Monthly");
    expect(result).not.toBeNull();
    expect(result).toContain("Monthly");
    expect(result).toContain("text mismatch");
  });

  it("returns a warning when overlay is not position:fixed", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      exists: true,
      textContent: "Selected: Monthly",
      positionFixed: false,
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "2147483647",
    });
    const result = await checkSelectOverlay(page, "Monthly");
    expect(result).not.toBeNull();
    expect(result).toContain("position");
  });

  it("returns a warning when overlay is not horizontally centered", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      exists: true,
      textContent: "Selected: Monthly",
      positionFixed: true,
      bottom: "24px",
      left: "20px",
      transform: "none",
      zIndex: "2147483647",
    });
    const result = await checkSelectOverlay(page, "Monthly");
    expect(result).not.toBeNull();
    expect(result).toContain("center");
  });

  it("does not throw when page.evaluate throws", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("detached"));
    const result = await checkSelectOverlay(page, "Monthly");
    expect(result).toBeNull();
  });
});

// ---------- #5: File Picker Overlay Rendering Check ----------

describe("checkFilePickerOverlay", () => {
  it("returns null when overlay is present with correct filename and centered position", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      exists: true,
      textContent: "📂 File selectedphoto.png",
      positionFixed: true,
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: "2147483647",
    });
    const result = await checkFilePickerOverlay(page, ["photo.png"]);
    expect(result).toBeNull();
  });

  it("returns a warning when the overlay element does not exist", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      exists: false,
    });
    const result = await checkFilePickerOverlay(page, ["photo.png"]);
    expect(result).not.toBeNull();
    expect(result).toContain("not found");
  });

  it("returns a warning when overlay text does not contain the expected filename", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      exists: true,
      textContent: "📂 File selecteddoc.pdf",
      positionFixed: true,
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: "2147483647",
    });
    const result = await checkFilePickerOverlay(page, ["photo.png"]);
    expect(result).not.toBeNull();
    expect(result).toContain("text mismatch");
  });

  it("returns a warning when overlay is not position:fixed", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      exists: true,
      textContent: "📂 File selectedphoto.png",
      positionFixed: false,
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: "2147483647",
    });
    const result = await checkFilePickerOverlay(page, ["photo.png"]);
    expect(result).not.toBeNull();
    expect(result).toContain("position");
  });

  it("returns a warning when overlay is not centered", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      exists: true,
      textContent: "📂 File selectedphoto.png",
      positionFixed: true,
      top: "10px",
      left: "10px",
      transform: "none",
      zIndex: "2147483647",
    });
    const result = await checkFilePickerOverlay(page, ["photo.png"]);
    expect(result).not.toBeNull();
    expect(result).toContain("center");
  });

  it("checks for multi-file label when multiple files provided", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      exists: true,
      textContent: "📂 File selected3 files",
      positionFixed: true,
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: "2147483647",
    });
    const result = await checkFilePickerOverlay(page, ["a.png", "b.png", "c.png"]);
    expect(result).toBeNull();
  });

  it("does not throw when page.evaluate throws", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("page closed"));
    const result = await checkFilePickerOverlay(page, ["photo.png"]);
    expect(result).toBeNull();
  });
});

// ---------- #52: Overlay Z-Index Stacking Verification ----------

describe("checkOverlayZIndex", () => {
  it("returns null when overlay z-index is above the highest page element", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      overlayZIndex: 2147483647,
      highestPageZIndex: 9999,
      overlayId: "dm-select-overlay",
    });
    const result = await checkOverlayZIndex(page, "dm-select-overlay");
    expect(result).toBeNull();
  });

  it("returns a warning when overlay z-index is lower than a page element", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      overlayZIndex: 100,
      highestPageZIndex: 9999,
      overlayId: "dm-select-overlay",
    });
    const result = await checkOverlayZIndex(page, "dm-select-overlay");
    expect(result).not.toBeNull();
    expect(result).toContain("dm-select-overlay");
    expect(result).toContain("100");
    expect(result).toContain("9999");
  });

  it("returns null when overlay element does not exist (cannot verify)", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await checkOverlayZIndex(page, "dm-select-overlay");
    expect(result).toBeNull();
  });

  it("returns null when page has no elements with z-index", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      overlayZIndex: 2147483647,
      highestPageZIndex: 0,
      overlayId: "dm-file-picker",
    });
    const result = await checkOverlayZIndex(page, "dm-file-picker");
    expect(result).toBeNull();
  });

  it("returns a warning when z-index values are equal (not strictly above)", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      overlayZIndex: 9999,
      highestPageZIndex: 9999,
      overlayId: "dm-select-overlay",
    });
    const result = await checkOverlayZIndex(page, "dm-select-overlay");
    expect(result).not.toBeNull();
    expect(result).toContain("not above");
  });

  it("does not throw when page.evaluate throws", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("frame detached"));
    const result = await checkOverlayZIndex(page, "dm-select-overlay");
    expect(result).toBeNull();
  });
});
