import { describe, expect, it, vi } from "vitest";
import {
  checkElementVisualGuards,
  collectElementVisualGuardFindings,
  isCenterHitTestClear,
  isElementInViewport,
  isElementNotClipped,
  isElementVisible,
  isImportantTextUncoveredByDemoOverlays,
  readElementVisualSnapshot,
  validateElementVisualSnapshot,
  type ElementVisualSnapshot,
} from "../../src/playback/element-visual-guards.js";
import type { PlaywrightLocator } from "../../src/playback/playwright.js";

interface FakeElementStyle {
  display?: string;
  visibility?: string;
  opacity?: string;
  overflow?: string;
  overflowX?: string;
  overflowY?: string;
  zIndex?: string;
}

class FakeElement {
  readonly tagName = "DIV";
  readonly id = "";
  readonly className = "";
  parentElement: FakeElement | null = null;
  children: FakeElement[] = [];

  constructor(
    private readonly rect: ElementVisualSnapshot["rect"],
    readonly style: FakeElementStyle = {},
  ) {}

  appendChild(child: FakeElement): void {
    child.parentElement = this;
    this.children.push(child);
  }

  getBoundingClientRect(): ElementVisualSnapshot["rect"] {
    if (!this.rect) throw new Error("Fake element requires a rect");
    return this.rect;
  }

  contains(value: FakeElement): boolean {
    return value === this || this.children.some((child) => child.contains(value));
  }
}

function makeLocator(evaluateResult?: unknown): PlaywrightLocator {
  return {
    nth: vi.fn().mockReturnThis(),
    click: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    setChecked: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(undefined),
    setInputFiles: vi.fn().mockResolvedValue(undefined),
    dragTo: vi.fn().mockResolvedValue(undefined),
    isVisible: vi.fn().mockResolvedValue(true),
    textContent: vi.fn().mockResolvedValue("Continue"),
    boundingBox: vi.fn().mockResolvedValue({ x: 10, y: 20, width: 100, height: 40 }),
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(evaluateResult),
    inputValue: vi.fn().mockResolvedValue(""),
  } as unknown as PlaywrightLocator;
}

async function readSnapshotFromBrowserCallback(
  target: FakeElement,
): Promise<ElementVisualSnapshot> {
  const locator = makeLocator(snapshot());
  await readElementVisualSnapshot(locator);
  const evaluate = locator.evaluate as ReturnType<typeof vi.fn>;
  const [callback, args] = evaluate.mock.calls[0] as [
    (target: unknown, args: { label: string; importantText: string[] }) => ElementVisualSnapshot,
    { label: string; importantText: string[] },
  ];
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalElement = globalThis.Element;
  try {
    vi.stubGlobal("Element", FakeElement);
    vi.stubGlobal("window", {
      innerWidth: 1280,
      innerHeight: 720,
      getComputedStyle: (element: FakeElement) => ({
        display: "block",
        visibility: "visible",
        opacity: "1",
        overflow: "visible",
        overflowX: "visible",
        overflowY: "visible",
        zIndex: "auto",
        ...element.style,
      }),
    });
    vi.stubGlobal("document", {
      elementFromPoint: () => target,
    });

    return callback(target, args);
  } finally {
    vi.stubGlobal("window", originalWindow);
    vi.stubGlobal("document", originalDocument);
    vi.stubGlobal("Element", originalElement);
  }
}

function snapshot(overrides: Partial<ElementVisualSnapshot> = {}): ElementVisualSnapshot {
  return {
    exists: true,
    label: "button.primary",
    rect: {
      x: 10,
      y: 20,
      width: 100,
      height: 40,
      top: 20,
      right: 110,
      bottom: 60,
      left: 10,
    },
    viewport: { width: 1280, height: 720 },
    display: "block",
    visibility: "visible",
    opacity: 1,
    visibleRatio: 1,
    clipped: false,
    centerHitTest: {
      x: 60,
      y: 40,
      blockedByNonDemoMachineElement: false,
      topIsDemoMachineElement: false,
      blocker: null,
    },
    importantText: [],
    ...overrides,
  };
}

describe("element visual predicates", () => {
  it("accepts a visible, in-viewport, unclipped element with a clear center hit-test", () => {
    const value = snapshot();

    expect(isElementVisible(value)).toBe(true);
    expect(isElementInViewport(value)).toBe(true);
    expect(isElementNotClipped(value)).toBe(true);
    expect(isCenterHitTestClear(value)).toBe(true);
    expect(isImportantTextUncoveredByDemoOverlays(value)).toBe(true);
    expect(validateElementVisualSnapshot(value)).toEqual([]);
    expect(collectElementVisualGuardFindings(value)).toEqual([]);
  });

  it("detects hidden elements", () => {
    const value = snapshot({ display: "none" });

    expect(isElementVisible(value)).toBe(false);
    expect(validateElementVisualSnapshot(value)).toContain(
      'Element visual guard: "button.primary" is not visible',
    );
    expect(collectElementVisualGuardFindings(value)[0]).toMatchObject({
      code: "not-visible",
      label: "button.primary",
      severity: "warn",
      details: { display: "none" },
    });
  });

  it("detects elements outside the viewport", () => {
    const value = snapshot({
      rect: {
        x: 1400,
        y: 20,
        width: 100,
        height: 40,
        top: 20,
        right: 1500,
        bottom: 60,
        left: 1400,
      },
      visibleRatio: 0,
      clipped: true,
    });

    expect(isElementInViewport(value)).toBe(false);
    expect(validateElementVisualSnapshot(value)).toContain(
      'Element visual guard: "button.primary" is outside the viewport',
    );
    expect(collectElementVisualGuardFindings(value).map((finding) => finding.code)).toContain(
      "outside-viewport",
    );
  });

  it("detects clipped elements using the visible ratio threshold", () => {
    const value = snapshot({ visibleRatio: 0.7, clipped: true });

    expect(isElementNotClipped(value)).toBe(false);
    expect(isElementNotClipped(value, 0.6)).toBe(true);
    expect(validateElementVisualSnapshot(value)).toContain(
      'Element visual guard: "button.primary" is clipped (70% visible)',
    );
    expect(collectElementVisualGuardFindings(value)[0]).toMatchObject({
      code: "clipped",
      details: { visibleRatio: 0.7, minVisibleRatio: 0.98 },
    });
  });

  it("accepts partially clipped targets when they satisfy the configured threshold", () => {
    const value = snapshot({ visibleRatio: 0.97, clipped: true });

    expect(isElementNotClipped(value)).toBe(false);
    expect(isElementNotClipped(value, 0.95)).toBe(true);
    expect(
      collectElementVisualGuardFindings(value, { minVisibleRatio: 0.95 }).map(
        (finding) => finding.code,
      ),
    ).not.toContain("clipped");
  });

  it("allows clipped elements when the configured visible ratio is satisfied", () => {
    const value = snapshot({ visibleRatio: 0.7, clipped: true });

    expect(validateElementVisualSnapshot(value, { minVisibleRatio: 0.6 })).toEqual([]);
  });

  it("detects a center hit-test blocked by a non-demo-machine element", () => {
    const value = snapshot({
      centerHitTest: {
        x: 60,
        y: 40,
        blockedByNonDemoMachineElement: true,
        topIsDemoMachineElement: false,
        blocker: {
          tag: "DIV",
          id: "modal-backdrop",
          className: "backdrop",
          zIndex: "1000",
          demoMachineElement: false,
        },
      },
    });

    expect(isCenterHitTestClear(value)).toBe(false);
    expect(validateElementVisualSnapshot(value)[0]).toContain("modal-backdrop");
    expect(collectElementVisualGuardFindings(value)[0]).toMatchObject({
      code: "center-blocked",
      details: { blocker: { id: "modal-backdrop", demoMachineElement: false } },
    });
  });

  it("allows demo-machine overlays at the element center", () => {
    const value = snapshot({
      centerHitTest: {
        x: 60,
        y: 40,
        blockedByNonDemoMachineElement: false,
        topIsDemoMachineElement: true,
        blocker: {
          tag: "DIV",
          id: "dm-cursor",
          className: "dm-overlay",
          zIndex: "2147483647",
          demoMachineElement: true,
        },
      },
    });

    expect(isCenterHitTestClear(value)).toBe(true);
    expect(validateElementVisualSnapshot(value)).toEqual([]);
  });

  it("detects important text covered by demo-machine overlays", () => {
    const value = snapshot({
      importantText: [
        {
          text: "Continue",
          found: true,
          rect: {
            x: 25,
            y: 30,
            width: 60,
            height: 16,
            top: 30,
            right: 85,
            bottom: 46,
            left: 25,
          },
          coveredByDemoMachineOverlay: true,
          overlay: {
            tag: "DIV",
            id: "dm-spotlight",
            className: "dm-callout",
            zIndex: "2147483647",
            demoMachineElement: true,
          },
        },
      ],
    });

    expect(isImportantTextUncoveredByDemoOverlays(value)).toBe(false);
    expect(validateElementVisualSnapshot(value)[0]).toContain('important text "Continue"');
    expect(collectElementVisualGuardFindings(value)[0]).toMatchObject({
      code: "important-text-covered",
      details: { text: "Continue", overlay: { id: "dm-spotlight" } },
    });
  });

  it("does not fail when requested important text is not found", () => {
    const value = snapshot({
      importantText: [
        {
          text: "Missing",
          found: false,
          rect: null,
          coveredByDemoMachineOverlay: false,
          overlay: null,
        },
      ],
    });

    expect(isImportantTextUncoveredByDemoOverlays(value)).toBe(true);
    expect(validateElementVisualSnapshot(value)).toEqual([]);
  });
});

describe("readElementVisualSnapshot", () => {
  it("passes label and important text to locator.evaluate", async () => {
    const value = snapshot();
    const locator = makeLocator(value);

    const result = await readElementVisualSnapshot(locator, {
      label: "Save button",
      importantText: ["Save", "Draft"],
    });

    expect(result).toBe(value);
    expect(locator.evaluate).toHaveBeenCalledWith(expect.any(Function), {
      label: "Save button",
      importantText: ["Save", "Draft"],
    });
  });

  it("normalizes a single important text value", async () => {
    const locator = makeLocator(snapshot());

    await readElementVisualSnapshot(locator, { importantText: "Continue" });

    expect(locator.evaluate).toHaveBeenCalledWith(expect.any(Function), {
      label: "target",
      importantText: ["Continue"],
    });
  });

  it("returns null when locator.evaluate throws", async () => {
    const locator = makeLocator();
    (locator.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("detached"));

    await expect(readElementVisualSnapshot(locator)).resolves.toBeNull();
  });

  it("accounts for clipping ancestors when computing visible ratio", async () => {
    const ancestor = new FakeElement(
      {
        x: 0,
        y: 0,
        width: 50,
        height: 40,
        top: 0,
        right: 50,
        bottom: 40,
        left: 0,
      },
      { overflow: "hidden" },
    );
    const target = new FakeElement({
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      top: 0,
      right: 100,
      bottom: 40,
      left: 0,
    });
    ancestor.appendChild(target);

    const result = await readSnapshotFromBrowserCallback(target);

    expect(result.visibleRatio).toBe(0.5);
    expect(result.clipped).toBe(true);
  });

  it("ignores non-clipping ancestors when computing visible ratio", async () => {
    const ancestor = new FakeElement(
      {
        x: 0,
        y: 0,
        width: 50,
        height: 40,
        top: 0,
        right: 50,
        bottom: 40,
        left: 0,
      },
      { overflow: "visible" },
    );
    const target = new FakeElement({
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      top: 0,
      right: 100,
      bottom: 40,
      left: 0,
    });
    ancestor.appendChild(target);

    const result = await readSnapshotFromBrowserCallback(target);

    expect(result.visibleRatio).toBe(1);
    expect(result.clipped).toBe(false);
  });
});

describe("checkElementVisualGuards", () => {
  it("returns an ok result with the snapshot", async () => {
    const value = snapshot();
    const locator = makeLocator(value);

    await expect(checkElementVisualGuards(locator)).resolves.toEqual({
      ok: true,
      warnings: [],
      findings: [],
      snapshot: value,
    });
  });

  it("returns warnings for failed visual guards", async () => {
    const locator = makeLocator(snapshot({ opacity: 0 }));

    const result = await checkElementVisualGuards(locator, { label: "CTA" });

    expect(result?.ok).toBe(false);
    expect(result?.warnings).toContain('Element visual guard: "CTA" is not visible');
    expect(result?.findings[0]).toMatchObject({ code: "not-visible", label: "CTA" });
  });

  it("returns null when a snapshot cannot be read", async () => {
    const locator = makeLocator();
    (locator.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("navigated"));

    await expect(checkElementVisualGuards(locator)).resolves.toBeNull();
  });
});
