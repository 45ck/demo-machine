import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PlaywrightPage } from "../../src/playback/playwright.js";
import type { BoundingBox } from "../../src/playback/geometry.js";
import {
  openClonedListbox,
  highlightClonedOption,
  openFakeDropdown,
  highlightFakeOption,
  closeSelectDropdown,
  readSelectOptions,
} from "../../src/playback/select-dropdown-visuals.js";
import {
  getSelectApproach,
  resolveApproachFn,
  registerCustomSelectApproach,
} from "../../src/playback/handlers/select-approaches.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockPage(
  overrides: Partial<Record<keyof PlaywrightPage, unknown>> = {},
): PlaywrightPage {
  return {
    evaluate: vi.fn().mockResolvedValue([]),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
    },
    goto: vi.fn().mockResolvedValue(undefined),
    goBack: vi.fn().mockResolvedValue(null),
    goForward: vi.fn().mockResolvedValue(null),
    locator: vi.fn().mockReturnValue({
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
      boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 100, height: 50 }),
      scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      waitFor: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(undefined),
      inputValue: vi.fn().mockResolvedValue(""),
    }),
    getByRole: vi.fn().mockReturnValue({}),
    getByText: vi.fn().mockReturnValue({}),
    getByTestId: vi.fn().mockReturnValue({}),
    getByLabel: vi.fn().mockReturnValue({}),
    getByPlaceholder: vi.fn().mockReturnValue({}),
    getByAltText: vi.fn().mockReturnValue({}),
    getByTitle: vi.fn().mockReturnValue({}),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("")),
    addStyleTag: vi.fn().mockResolvedValue(undefined),
    context: vi.fn(() => ({ addCookies: vi.fn().mockResolvedValue(undefined) })),
    ...overrides,
  } as unknown as PlaywrightPage;
}

const sampleBox: BoundingBox = { x: 100, y: 200, width: 200, height: 30 };

const sampleOptionBoxes: Array<BoundingBox | null> = [
  { x: 100, y: 232, width: 200, height: 24 },
  { x: 100, y: 256, width: 200, height: 24 },
  { x: 100, y: 280, width: 200, height: 24 },
];

const sampleOptions = [
  { value: "free", text: "Free", disabled: false, isTarget: false },
  { value: "pro", text: "Pro Plan", disabled: false, isTarget: true },
  { value: "enterprise", text: "Enterprise", disabled: true, isTarget: false },
];

// ---------------------------------------------------------------------------
// select-dropdown-visuals
// ---------------------------------------------------------------------------

describe("select-dropdown-visuals", () => {
  let page: PlaywrightPage;

  beforeEach(() => {
    page = createMockPage();
    vi.clearAllMocks();
  });

  // --- openClonedListbox ---------------------------------------------------

  describe("openClonedListbox", () => {
    it("injects DOM and returns bounding boxes", async () => {
      // First evaluate call: inject DOM (returns undefined).
      // Second evaluate call: read bounding boxes.
      vi.mocked(page.evaluate)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(sampleOptionBoxes);

      const boxes = await openClonedListbox(page, sampleBox);

      expect(page.evaluate).toHaveBeenCalledTimes(2);

      // First call: injection receives { id, box }
      const firstCallArg = vi.mocked(page.evaluate).mock.calls[0][1] as {
        id: string;
        box: BoundingBox;
      };
      expect(firstCallArg).toEqual(
        expect.objectContaining({ id: "dm-select-dropdown", box: sampleBox }),
      );

      // Animation delay
      expect(page.waitForTimeout).toHaveBeenCalledWith(180);

      // Second call: read boxes, receives the id string
      const secondCallArg = vi.mocked(page.evaluate).mock.calls[1][1];
      expect(secondCallArg).toBe("dm-select-dropdown");

      // Returned bounding boxes
      expect(boxes).toEqual(sampleOptionBoxes);
      expect(boxes).toHaveLength(3);
    });

    it("removes existing overlay before creating new one", async () => {
      vi.mocked(page.evaluate)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(sampleOptionBoxes);

      await openClonedListbox(page, sampleBox);

      // The injection function body removes any existing element with the same id
      // before creating a new one. We verify the function was called with the id
      // so the browser-side code can find and remove the existing element.
      const injectionArg = vi.mocked(page.evaluate).mock.calls[0][1] as {
        id: string;
        box: BoundingBox;
      };
      expect(injectionArg.id).toBe("dm-select-dropdown");
    });
  });

  // --- highlightClonedOption -----------------------------------------------

  describe("highlightClonedOption", () => {
    it("highlights target with blue background", async () => {
      await highlightClonedOption(page, 2, true);

      expect(page.evaluate).toHaveBeenCalledTimes(1);
      const arg = vi.mocked(page.evaluate).mock.calls[0][1] as {
        id: string;
        index: number;
        isTarget: boolean;
      };
      expect(arg).toEqual({
        id: "dm-select-dropdown",
        index: 2,
        isTarget: true,
      });
    });

    it("highlights non-target with light blue (hover style)", async () => {
      await highlightClonedOption(page, 0, false);

      expect(page.evaluate).toHaveBeenCalledTimes(1);
      const arg = vi.mocked(page.evaluate).mock.calls[0][1] as {
        id: string;
        index: number;
        isTarget: boolean;
      };
      expect(arg).toEqual({
        id: "dm-select-dropdown",
        index: 0,
        isTarget: false,
      });
    });
  });

  // --- openFakeDropdown ----------------------------------------------------

  describe("openFakeDropdown", () => {
    it("injects styled overlay with correct options", async () => {
      vi.mocked(page.evaluate)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(sampleOptionBoxes);

      const boxes = await openFakeDropdown(page, sampleBox, sampleOptions);

      expect(page.evaluate).toHaveBeenCalledTimes(2);

      // Injection call receives id, box, and options
      const injectionArg = vi.mocked(page.evaluate).mock.calls[0][1] as {
        id: string;
        box: BoundingBox;
        options: typeof sampleOptions;
      };
      expect(injectionArg.id).toBe("dm-select-dropdown");
      expect(injectionArg.box).toEqual(sampleBox);
      expect(injectionArg.options).toEqual(sampleOptions);

      // Animation delay
      expect(page.waitForTimeout).toHaveBeenCalledWith(150);

      expect(boxes).toEqual(sampleOptionBoxes);
    });

    it("positions below select when space available", async () => {
      vi.mocked(page.evaluate)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(sampleOptionBoxes);

      await openFakeDropdown(page, sampleBox, sampleOptions);

      // The positioning logic is inside page.evaluate. We verify it receives
      // the bounding box correctly so the browser-side calculation can place
      // the dropdown at box.y + box.height + 2 when there is enough space.
      const injectionArg = vi.mocked(page.evaluate).mock.calls[0][1] as {
        box: BoundingBox;
      };
      expect(injectionArg.box).toEqual(sampleBox);
    });
  });

  // --- highlightFakeOption -------------------------------------------------

  describe("highlightFakeOption", () => {
    it("highlights correct row with target params", async () => {
      await highlightFakeOption(page, 1, true);

      expect(page.evaluate).toHaveBeenCalledTimes(1);
      const arg = vi.mocked(page.evaluate).mock.calls[0][1] as {
        id: string;
        index: number;
        isTarget: boolean;
      };
      expect(arg).toEqual({
        id: "dm-select-dropdown",
        index: 1,
        isTarget: true,
      });
    });

    it("highlights non-target row with hover params", async () => {
      await highlightFakeOption(page, 0, false);

      const arg = vi.mocked(page.evaluate).mock.calls[0][1] as {
        id: string;
        index: number;
        isTarget: boolean;
      };
      expect(arg).toEqual({
        id: "dm-select-dropdown",
        index: 0,
        isTarget: false,
      });
    });
  });

  // --- closeSelectDropdown -------------------------------------------------

  describe("closeSelectDropdown", () => {
    it("fades out and removes element", async () => {
      await closeSelectDropdown(page);

      expect(page.evaluate).toHaveBeenCalledTimes(1);

      // Receives the dropdown id
      const arg = vi.mocked(page.evaluate).mock.calls[0][1];
      expect(arg).toBe("dm-select-dropdown");

      // Waits for fade-out animation
      expect(page.waitForTimeout).toHaveBeenCalledWith(180);
    });

    it("does not throw when element is absent", async () => {
      // The browser-side function guards with `if (!el) return;` — the
      // evaluate call itself resolves without error.
      vi.mocked(page.evaluate).mockResolvedValueOnce(undefined);

      await expect(closeSelectDropdown(page)).resolves.toBeUndefined();
    });
  });

  // --- readSelectOptions ---------------------------------------------------

  describe("readSelectOptions", () => {
    it("extracts options with isTarget flag by value", async () => {
      vi.mocked(page.evaluate).mockResolvedValueOnce(sampleOptions);

      const result = await readSelectOptions(page, sampleBox, { value: "pro" });

      expect(page.evaluate).toHaveBeenCalledTimes(1);

      // Receives { box, spec }
      const arg = vi.mocked(page.evaluate).mock.calls[0][1] as {
        box: BoundingBox;
        spec: { value?: string; label?: string; index?: number };
      };
      expect(arg.box).toEqual(sampleBox);
      expect(arg.spec).toEqual({ value: "pro" });

      expect(result).toEqual(sampleOptions);
    });

    it("marks target by label", async () => {
      const labelOptions = [
        { value: "free", text: "Free", disabled: false, isTarget: false },
        { value: "pro", text: "Pro Plan", disabled: false, isTarget: true },
      ];
      vi.mocked(page.evaluate).mockResolvedValueOnce(labelOptions);

      const result = await readSelectOptions(page, sampleBox, { label: "Pro Plan" });

      const arg = vi.mocked(page.evaluate).mock.calls[0][1] as {
        spec: { label?: string };
      };
      expect(arg.spec).toEqual({ label: "Pro Plan" });
      expect(result).toEqual(labelOptions);
    });

    it("marks target by index", async () => {
      const indexOptions = [
        { value: "free", text: "Free", disabled: false, isTarget: false },
        { value: "pro", text: "Pro Plan", disabled: false, isTarget: false },
        { value: "enterprise", text: "Enterprise", disabled: true, isTarget: true },
      ];
      vi.mocked(page.evaluate).mockResolvedValueOnce(indexOptions);

      const result = await readSelectOptions(page, sampleBox, { index: 2 });

      const arg = vi.mocked(page.evaluate).mock.calls[0][1] as {
        spec: { index?: number };
      };
      expect(arg.spec).toEqual({ index: 2 });
      expect(result).toEqual(indexOptions);
    });

    it("returns empty array when no select found", async () => {
      vi.mocked(page.evaluate).mockResolvedValueOnce([]);

      const result = await readSelectOptions(page, sampleBox, { value: "missing" });

      expect(result).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// select-approaches
// ---------------------------------------------------------------------------

describe("select-approaches", () => {
  const originalEnv = process.env["DM_SELECT_APPROACH"];

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["DM_SELECT_APPROACH"];
  });

  afterEach(() => {
    // Restore env
    if (originalEnv !== undefined) {
      process.env["DM_SELECT_APPROACH"] = originalEnv;
    } else {
      delete process.env["DM_SELECT_APPROACH"];
    }
  });

  // --- getSelectApproach ---------------------------------------------------

  describe("getSelectApproach", () => {
    it("returns C by default when no env var set", () => {
      delete process.env["DM_SELECT_APPROACH"];
      expect(getSelectApproach()).toBe("C");
    });

    it("reads DM_SELECT_APPROACH env var set to A", () => {
      process.env["DM_SELECT_APPROACH"] = "A";
      expect(getSelectApproach()).toBe("A");
    });

    it("reads DM_SELECT_APPROACH env var set to B", () => {
      process.env["DM_SELECT_APPROACH"] = "B";
      expect(getSelectApproach()).toBe("B");
    });

    it("reads DM_SELECT_APPROACH env var set to C", () => {
      process.env["DM_SELECT_APPROACH"] = "C";
      expect(getSelectApproach()).toBe("C");
    });

    it("reads DM_SELECT_APPROACH env var set to D", () => {
      process.env["DM_SELECT_APPROACH"] = "D";
      expect(getSelectApproach()).toBe("D");
    });

    it("normalizes lowercase to uppercase", () => {
      process.env["DM_SELECT_APPROACH"] = "a";
      expect(getSelectApproach()).toBe("A");
    });

    it("ignores invalid values and returns C", () => {
      process.env["DM_SELECT_APPROACH"] = "Z";
      expect(getSelectApproach()).toBe("C");
    });

    it("ignores empty string and returns C", () => {
      process.env["DM_SELECT_APPROACH"] = "";
      expect(getSelectApproach()).toBe("C");
    });
  });

  // --- resolveApproachFn ---------------------------------------------------

  describe("resolveApproachFn", () => {
    it("returns a function for approach A", () => {
      const fn = resolveApproachFn("A");
      expect(typeof fn).toBe("function");
    });

    it("returns a function for approach B", () => {
      const fn = resolveApproachFn("B");
      expect(typeof fn).toBe("function");
    });

    it("returns a function for approach C", () => {
      const fn = resolveApproachFn("C");
      expect(typeof fn).toBe("function");
    });

    it("returns distinct functions for different approaches", () => {
      const fnA = resolveApproachFn("A");
      const fnB = resolveApproachFn("B");
      const fnC = resolveApproachFn("C");
      expect(fnA).not.toBe(fnB);
      expect(fnA).not.toBe(fnC);
      expect(fnB).not.toBe(fnC);
    });

    it("D falls back to C when no custom registered", () => {
      const fnD = resolveApproachFn("D");
      const fnC = resolveApproachFn("C");
      // Without a custom approach registered, D resolves to the same fn as C
      expect(fnD).toBe(fnC);
    });
  });

  // --- registerCustomSelectApproach ----------------------------------------

  describe("registerCustomSelectApproach", () => {
    it("D uses registered function after registration", () => {
      const customFn = vi.fn().mockResolvedValue("custom-selected");
      registerCustomSelectApproach(customFn);

      const fnD = resolveApproachFn("D");
      expect(fnD).toBe(customFn);

      // Clean up: reset by registering null-equivalent; since the API only
      // allows registering a function, we re-register a passthrough that
      // won't affect other tests. Instead, we rely on module-level state
      // and acknowledge the custom fn is now set.
    });

    it("does not affect approaches A, B, or C", () => {
      const customFn = vi.fn().mockResolvedValue("custom");
      registerCustomSelectApproach(customFn);

      expect(resolveApproachFn("A")).not.toBe(customFn);
      expect(resolveApproachFn("B")).not.toBe(customFn);
      expect(resolveApproachFn("C")).not.toBe(customFn);
    });
  });
});
