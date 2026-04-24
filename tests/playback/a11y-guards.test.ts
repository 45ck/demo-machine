import { describe, it, expect, vi } from "vitest";
import {
  checkActionability,
  checkMissingLabels,
  checkSemanticFormTarget,
  checkAriaRoleConsistency,
} from "../../src/playback/a11y-guards.js";
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

// ---------------------------------------------------------------------------
// #35: Actionability Attribute Validator
// ---------------------------------------------------------------------------
describe("checkActionability", () => {
  // click
  it("returns null for click on a <button>", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "BUTTON",
      role: null,
      contentEditable: "inherit",
      type: null,
    });
    const result = await checkActionability(page, "#btn", "click");
    expect(result).toBeNull();
  });

  it("returns null for click on an <a>", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "A",
      role: null,
      contentEditable: "inherit",
      type: null,
    });
    const result = await checkActionability(page, "a.link", "click");
    expect(result).toBeNull();
  });

  it("returns null for click on an <input>", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "INPUT",
      role: null,
      contentEditable: "inherit",
      type: "submit",
    });
    const result = await checkActionability(page, "#submit", "click");
    expect(result).toBeNull();
  });

  it("returns null for click on a <select>", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "SELECT",
      role: null,
      contentEditable: "inherit",
      type: "select-one",
    });
    const result = await checkActionability(page, "#status", "click");
    expect(result).toBeNull();
  });

  it("returns null for click on an element with role=button", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "DIV",
      role: "button",
      contentEditable: "inherit",
      type: null,
    });
    const result = await checkActionability(page, "#div-btn", "click");
    expect(result).toBeNull();
  });

  it("returns null for click on a label associated with a form control", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "LABEL",
      role: null,
      contentEditable: "inherit",
      type: null,
      labelsControl: true,
    });
    const result = await checkActionability(page, "[data-testid='plan-pro']", "click");
    expect(result).toBeNull();
  });

  it("returns a warning for click on a <div> without role", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "DIV",
      role: null,
      contentEditable: "inherit",
      type: null,
    });
    const result = await checkActionability(page, "#div-btn", "click");
    expect(result).not.toBeNull();
    expect(result).toContain("#div-btn");
    expect(result).toContain("click");
    expect(result).toContain("DIV");
  });

  // type
  it("returns null for type on an <input>", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "INPUT",
      role: null,
      contentEditable: "inherit",
      type: "text",
    });
    const result = await checkActionability(page, "#name", "type");
    expect(result).toBeNull();
  });

  it("returns null for type on a <textarea>", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "TEXTAREA",
      role: null,
      contentEditable: "inherit",
      type: null,
    });
    const result = await checkActionability(page, "#comment", "type");
    expect(result).toBeNull();
  });

  it("returns null for type on a contenteditable element", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "DIV",
      role: null,
      contentEditable: "true",
      type: null,
    });
    const result = await checkActionability(page, "#editor", "type");
    expect(result).toBeNull();
  });

  it("returns a warning for type on a <span> without contenteditable", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "SPAN",
      role: null,
      contentEditable: "inherit",
      type: null,
    });
    const result = await checkActionability(page, "#label", "type");
    expect(result).not.toBeNull();
    expect(result).toContain("#label");
    expect(result).toContain("type");
  });

  // check / uncheck
  it("returns null for check on an input[type=checkbox]", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "INPUT",
      role: null,
      contentEditable: "inherit",
      type: "checkbox",
    });
    const result = await checkActionability(page, "#agree", "check");
    expect(result).toBeNull();
  });

  it("returns null for uncheck on an element with role=switch", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "SPAN",
      role: "switch",
      contentEditable: "inherit",
      type: null,
    });
    const result = await checkActionability(page, "#toggle", "uncheck");
    expect(result).toBeNull();
  });

  it("returns null for check on an element with role=checkbox", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "DIV",
      role: "checkbox",
      contentEditable: "inherit",
      type: null,
    });
    const result = await checkActionability(page, "#custom-cb", "check");
    expect(result).toBeNull();
  });

  it("returns a warning for check on a <div> without role", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "DIV",
      role: null,
      contentEditable: "inherit",
      type: null,
    });
    const result = await checkActionability(page, "#fake-cb", "check");
    expect(result).not.toBeNull();
    expect(result).toContain("#fake-cb");
    expect(result).toContain("check");
  });

  // select
  it("returns null for select on a <select>", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "SELECT",
      role: null,
      contentEditable: "inherit",
      type: null,
    });
    const result = await checkActionability(page, "#country", "select");
    expect(result).toBeNull();
  });

  it("returns null for select on an element with role=listbox", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "UL",
      role: "listbox",
      contentEditable: "inherit",
      type: null,
    });
    const result = await checkActionability(page, "#custom-select", "select");
    expect(result).toBeNull();
  });

  it("returns a warning for select on a <div> without role", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "DIV",
      role: null,
      contentEditable: "inherit",
      type: null,
    });
    const result = await checkActionability(page, "#fake-select", "select");
    expect(result).not.toBeNull();
    expect(result).toContain("#fake-select");
    expect(result).toContain("select");
  });

  // edge cases
  it("returns null when evaluate returns null (element not found)", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await checkActionability(page, "#missing", "click");
    expect(result).toBeNull();
  });

  it("does not throw when page.evaluate throws", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("detached"));
    const result = await checkActionability(page, "#btn", "click");
    expect(result).toBeNull();
  });

  it("returns null for non-validated action types (e.g. hover)", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "DIV",
      role: null,
      contentEditable: "inherit",
      type: null,
    });
    const result = await checkActionability(page, "#elem", "hover");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// #64: Missing Label Detection
// ---------------------------------------------------------------------------
describe("checkMissingLabels", () => {
  it("returns empty array when all elements have accessible names", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const result = await checkMissingLabels(page);
    expect(result).toEqual([]);
  });

  it("returns warnings for elements with no accessible name", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue([
      { tag: "INPUT", type: "text", id: "email", selector: "input#email" },
      { tag: "SELECT", type: null, id: "", selector: "select.country" },
    ]);
    const result = await checkMissingLabels(page);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("input#email");
    expect(result[0]).toContain("no accessible name");
    expect(result[1]).toContain("select.country");
  });

  it("does not throw when page.evaluate throws", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nav"));
    const result = await checkMissingLabels(page);
    expect(result).toEqual([]);
  });

  it("returns empty array when evaluate returns null", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await checkMissingLabels(page);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// #71: Semantic HTML Validation for Form Steps
// ---------------------------------------------------------------------------
describe("checkSemanticFormTarget", () => {
  it("returns null for type targeting an <input>", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "INPUT",
      role: null,
    });
    const result = await checkSemanticFormTarget(page, "#name", "type");
    expect(result).toBeNull();
  });

  it("returns null for type targeting a <textarea>", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "TEXTAREA",
      role: null,
    });
    const result = await checkSemanticFormTarget(page, "#bio", "type");
    expect(result).toBeNull();
  });

  it("returns a warning for type targeting a <div> without role", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "DIV",
      role: null,
    });
    const result = await checkSemanticFormTarget(page, "#rich-editor", "type");
    expect(result).not.toBeNull();
    expect(result).toContain("#rich-editor");
    expect(result).toContain("DIV");
    expect(result).toContain("semantic");
  });

  it("returns null for type targeting a <div> with role=textbox", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "DIV",
      role: "textbox",
    });
    const result = await checkSemanticFormTarget(page, "#rich-editor", "type");
    expect(result).toBeNull();
  });

  it("returns null for check targeting an input[type=checkbox]", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "INPUT",
      role: null,
      type: "checkbox",
    });
    const result = await checkSemanticFormTarget(page, "#agree", "check");
    expect(result).toBeNull();
  });

  it("returns a warning for check targeting a <span> without role", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "SPAN",
      role: null,
      type: null,
    });
    const result = await checkSemanticFormTarget(page, "#fake-checkbox", "check");
    expect(result).not.toBeNull();
    expect(result).toContain("#fake-checkbox");
    expect(result).toContain("semantic");
  });

  it("returns null for check targeting a <div> with role=checkbox", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "DIV",
      role: "checkbox",
      type: null,
    });
    const result = await checkSemanticFormTarget(page, "#custom-cb", "check");
    expect(result).toBeNull();
  });

  it("returns null for select targeting a <select>", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "SELECT",
      role: null,
    });
    const result = await checkSemanticFormTarget(page, "#country", "select");
    expect(result).toBeNull();
  });

  it("returns a warning for select targeting a <div> without role", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "DIV",
      role: null,
    });
    const result = await checkSemanticFormTarget(page, "#custom-dd", "select");
    expect(result).not.toBeNull();
    expect(result).toContain("#custom-dd");
    expect(result).toContain("semantic");
  });

  it("returns null for select targeting a <div> with role=listbox", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "DIV",
      role: "listbox",
    });
    const result = await checkSemanticFormTarget(page, "#custom-dd", "select");
    expect(result).toBeNull();
  });

  it("returns null for uncheck targeting an input[type=checkbox]", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({
      tag: "INPUT",
      role: null,
      type: "checkbox",
    });
    const result = await checkSemanticFormTarget(page, "#agree", "uncheck");
    expect(result).toBeNull();
  });

  it("returns null for non-form action (e.g. click)", async () => {
    const page = createMockPage();
    // Should not even evaluate for non-form actions
    const result = await checkSemanticFormTarget(page, "#btn", "click");
    expect(result).toBeNull();
  });

  it("returns null when evaluate returns null (element not found)", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await checkSemanticFormTarget(page, "#missing", "type");
    expect(result).toBeNull();
  });

  it("does not throw when page.evaluate throws", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("detached"));
    const result = await checkSemanticFormTarget(page, "#input", "type");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// #61: ARIA Role Consistency Audit
// ---------------------------------------------------------------------------
describe("checkAriaRoleConsistency", () => {
  it("returns empty array when all roles have required properties", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const result = await checkAriaRoleConsistency(page);
    expect(result).toEqual([]);
  });

  it("returns warnings for role=checkbox without aria-checked", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        selector: "div.toggle",
        role: "checkbox",
        missingProps: ["aria-checked"],
      },
    ]);
    const result = await checkAriaRoleConsistency(page);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("div.toggle");
    expect(result[0]).toContain("checkbox");
    expect(result[0]).toContain("aria-checked");
  });

  it("returns multiple warnings for multiple violations", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        selector: "div.toggle",
        role: "checkbox",
        missingProps: ["aria-checked"],
      },
      {
        selector: "div.slider",
        role: "slider",
        missingProps: ["aria-valuenow", "aria-valuemin", "aria-valuemax"],
      },
    ]);
    const result = await checkAriaRoleConsistency(page);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("checkbox");
    expect(result[1]).toContain("slider");
    expect(result[1]).toContain("aria-valuenow");
  });

  it("does not throw when page.evaluate throws", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nav"));
    const result = await checkAriaRoleConsistency(page);
    expect(result).toEqual([]);
  });

  it("returns empty array when evaluate returns null", async () => {
    const page = createMockPage();
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await checkAriaRoleConsistency(page);
    expect(result).toEqual([]);
  });
});
