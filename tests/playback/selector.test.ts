import { describe, expect, it, vi } from "vitest";
import {
  resolveLocatorFromInput,
  resolveStepLocator,
  selectorForEvent,
  selectorForEventFromInput,
} from "../../src/playback/selector.js";
import type { PlaywrightLocator, PlaywrightPage } from "../../src/playback/playwright.js";

function makeLocator(): PlaywrightLocator {
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
    textContent: vi.fn().mockResolvedValue(""),
    boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 10, height: 10 }),
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
  };
  return locator as unknown as PlaywrightLocator;
}

function createMockPage() {
  const cssLocator = makeLocator();
  const roleLocator = makeLocator();
  const textLocator = makeLocator();
  const testIdLocator = makeLocator();
  const labelLocator = makeLocator();
  const placeholderLocator = makeLocator();
  const altTextLocator = makeLocator();
  const titleLocator = makeLocator();

  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    goBack: vi.fn().mockResolvedValue(undefined),
    goForward: vi.fn().mockResolvedValue(undefined),
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
    },
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn().mockReturnValue(cssLocator),
    getByRole: vi.fn().mockReturnValue(roleLocator),
    getByText: vi.fn().mockReturnValue(textLocator),
    getByTestId: vi.fn().mockReturnValue(testIdLocator),
    getByLabel: vi.fn().mockReturnValue(labelLocator),
    getByPlaceholder: vi.fn().mockReturnValue(placeholderLocator),
    getByAltText: vi.fn().mockReturnValue(altTextLocator),
    getByTitle: vi.fn().mockReturnValue(titleLocator),
    evaluate: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("")),
    addStyleTag: vi.fn().mockResolvedValue(undefined),
    context: vi.fn(() => ({ addCookies: vi.fn().mockResolvedValue(undefined) })),
  } satisfies PlaywrightPage;

  return {
    page,
    locators: {
      cssLocator,
      roleLocator,
      textLocator,
      testIdLocator,
      labelLocator,
      placeholderLocator,
      altTextLocator,
      titleLocator,
    },
  };
}

describe("selectorForEventFromInput", () => {
  it("renders selector and nth when selector is provided", () => {
    expect(selectorForEventFromInput({ selector: "#save", nth: 2 }, "fallback")).toBe(
      "#save[nth=2]",
    );
  });

  it("renders structured targets when target is provided", () => {
    expect(
      selectorForEventFromInput(
        { target: { by: "role", role: "button", name: "Save" }, nth: 1 },
        "fallback",
      ),
    ).toBe('target(role:button[name="Save"])[nth=1]');
  });

  it("falls back when neither selector nor target are provided", () => {
    expect(selectorForEventFromInput({}, "action(click)")).toBe("action(click)");
  });
});

describe("resolveLocatorFromInput", () => {
  it("resolves CSS selectors and applies nth", () => {
    const { page, locators } = createMockPage();
    const result = resolveLocatorFromInput(page, { selector: ".row", nth: 1 }, "Click");

    expect(page.locator).toHaveBeenCalledWith(".row");
    expect(locators.cssLocator.nth).toHaveBeenCalledWith(1);
    expect(result.selectorForEvent).toBe(".row[nth=1]");
  });

  it("resolves role targets with exact and name", () => {
    const { page, locators } = createMockPage();
    const result = resolveLocatorFromInput(
      page,
      { target: { by: "role", role: "button", name: "Continue", exact: true }, nth: 0 },
      "Click",
    );

    expect(page.getByRole).toHaveBeenCalledWith("button", { name: "Continue", exact: true });
    expect(locators.roleLocator.nth).toHaveBeenCalledWith(0);
    expect(result.selectorForEvent).toBe('target(role:button[name="Continue"])[nth=0]');
  });

  it("resolves text-like targets through the appropriate Playwright helper", () => {
    const { page } = createMockPage();

    resolveLocatorFromInput(page, { target: { by: "text", text: "Pricing", exact: true } }, "Step");
    resolveLocatorFromInput(page, { target: { by: "label", text: "Email" } }, "Step");
    resolveLocatorFromInput(
      page,
      { target: { by: "placeholder", text: "name@company.com" } },
      "Step",
    );
    resolveLocatorFromInput(page, { target: { by: "altText", text: "Company logo" } }, "Step");
    resolveLocatorFromInput(page, { target: { by: "title", text: "Open menu" } }, "Step");

    expect(page.getByText).toHaveBeenCalledWith("Pricing", { exact: true });
    expect(page.getByLabel).toHaveBeenCalledWith("Email", undefined);
    expect(page.getByPlaceholder).toHaveBeenCalledWith("name@company.com", undefined);
    expect(page.getByAltText).toHaveBeenCalledWith("Company logo", undefined);
    expect(page.getByTitle).toHaveBeenCalledWith("Open menu", undefined);
  });

  it("resolves testId and css-style target objects", () => {
    const { page } = createMockPage();

    resolveLocatorFromInput(page, { target: { by: "testId", testId: "save-button" } }, "Step");
    resolveLocatorFromInput(page, { target: { by: "css", selector: "[data-row='1']" } }, "Step");

    expect(page.getByTestId).toHaveBeenCalledWith("save-button");
    expect(page.locator).toHaveBeenCalledWith("[data-row='1']");
  });

  it("throws when locator input has neither selector nor target", () => {
    const { page } = createMockPage();
    expect(() => resolveLocatorFromInput(page, {}, "Click step")).toThrow(
      'Click step requires "selector" or supported "target"',
    );
  });
});

describe("resolveStepLocator", () => {
  it("extracts selector, target, and nth from a step", () => {
    const { page, locators } = createMockPage();
    const result = resolveStepLocator(page, {
      action: "click",
      target: { by: "testId", testId: "save" },
      nth: 3,
    } as never);

    expect(page.getByTestId).toHaveBeenCalledWith("save");
    expect(locators.testIdLocator.nth).toHaveBeenCalledWith(3);
    expect(result.selectorForEvent).toBe("target(testId:save)[nth=3]");
  });
});

describe("selectorForEvent", () => {
  it("formats step selectors for event logs", () => {
    expect(selectorForEvent({ action: "hover", selector: ".menu" } as never)).toBe(".menu");
    expect(
      selectorForEvent({
        action: "assert",
        target: { by: "label", text: "Email" },
      } as never),
    ).toBe("target(label:Email)");
  });
});
