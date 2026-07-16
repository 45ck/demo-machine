import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlaywrightPage } from "../../src/playback/playwright.js";
import type { ActionHandler, PlaybackContext } from "../../src/playback/action-core.js";
import type { Step } from "../../src/spec/types.js";
import type { ActionEvent } from "../../src/playback/types.js";
import type { ScreenshotCollector } from "../../src/playback/screenshot-collector.js";
import {
  wrapWithScreenshotCapture,
  captureChapterTitles,
} from "../../src/playback/capture-hooks.js";

function createMockPage(): PlaywrightPage {
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
    evaluate: vi.fn().mockResolvedValue(undefined),
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
    evaluate: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-screenshot")),
    addStyleTag: vi.fn().mockResolvedValue(undefined),
    context: vi.fn(() => ({ addCookies: vi.fn().mockResolvedValue(undefined) })),
  } as unknown as PlaywrightPage;
}

function createMockCollector(): ScreenshotCollector {
  return {
    captureStep: vi.fn().mockResolvedValue(undefined),
    captureBeforeAssert: vi.fn().mockResolvedValue(undefined),
    captureAfterAssert: vi.fn().mockResolvedValue(undefined),
    recordCursorPosition: vi.fn(),
    captureChapterTitle: vi.fn().mockResolvedValue(undefined),
    getResults: vi.fn().mockReturnValue({
      stepScreenshots: new Map(),
      assertScreenshotPairs: [],
      cursorPositions: [],
      chapterTitleScreenshots: new Map(),
    }),
    reset: vi.fn(),
  } as unknown as ScreenshotCollector;
}

function createMockContext(page: PlaywrightPage): PlaybackContext {
  return {
    page,
    baseUrl: "http://localhost:3000",
    pacing: {
      cursorDurationMs: 0,
      typeDelayMs: 0,
      postClickDelayMs: 0,
      postTypeDelayMs: 0,
      postNavigateDelayMs: 0,
      settleDelayMs: 0,
    },
    moveCursorTo: vi.fn().mockResolvedValue(undefined),
    reinjectCursor: vi.fn().mockResolvedValue(undefined),
    waitAfterStep: vi.fn().mockResolvedValue(undefined),
  };
}

describe("wrapWithScreenshotCapture", () => {
  let page: PlaywrightPage;
  let collector: ScreenshotCollector;
  let ctx: PlaybackContext;

  beforeEach(() => {
    page = createMockPage();
    collector = createMockCollector();
    ctx = createMockContext(page);
  });

  it("calls captureStep after every handler", async () => {
    const handler: ActionHandler = vi.fn().mockResolvedValue(undefined);
    const wrapped = wrapWithScreenshotCapture(handler, collector);
    const step = { action: "navigate", url: "/home" } as unknown as Step;
    const events: ActionEvent[] = [];

    await wrapped(ctx, step, events, 0);

    expect(collector.captureStep).toHaveBeenCalledWith(0, page);
    expect(collector.captureStep).toHaveBeenCalledTimes(1);
  });

  it("calls captureBeforeAssert and captureAfterAssert for assert steps", async () => {
    const handler: ActionHandler = vi.fn().mockResolvedValue(undefined);
    const wrapped = wrapWithScreenshotCapture(handler, collector);
    const step = { action: "assert", selector: "#result", visible: true } as unknown as Step;
    const events: ActionEvent[] = [];

    await wrapped(ctx, step, events, 3);

    expect(collector.captureBeforeAssert).toHaveBeenCalledWith(3, page);
    expect(collector.captureAfterAssert).toHaveBeenCalledWith(3, page);
    // captureBeforeAssert must be called before the handler
    const beforeCall = (collector.captureBeforeAssert as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0]!;
    const handlerCall = (handler as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    const afterCall = (collector.captureAfterAssert as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0]!;
    expect(beforeCall).toBeLessThan(handlerCall);
    expect(handlerCall).toBeLessThan(afterCall);
  });

  it("records cursor position for click steps with bounding box", async () => {
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({ x: 137, y: 219 });
    const handler: ActionHandler = vi.fn(async (_ctx, _step, events: ActionEvent[]) => {
      events.push({
        action: "click",
        timestamp: 1000,
        duration: 100,
        selector: "#btn",
        boundingBox: { x: 100, y: 200, width: 80, height: 40 },
      });
    });
    const wrapped = wrapWithScreenshotCapture(handler, collector);
    const step = { action: "click", selector: "#btn" } as unknown as Step;
    const events: ActionEvent[] = [];

    await wrapped(ctx, step, events, 2);

    expect(collector.recordCursorPosition).toHaveBeenCalledWith({
      stepIndex: 2,
      cursorX: 137,
      cursorY: 219,
      targetCenterX: 140,
      targetCenterY: 220,
    });
  });

  it("does not record cursor position for click steps without bounding box", async () => {
    const handler: ActionHandler = vi.fn(async (_ctx, _step, events: ActionEvent[]) => {
      events.push({
        action: "click",
        timestamp: 1000,
        duration: 100,
        selector: "#btn",
      });
    });
    const wrapped = wrapWithScreenshotCapture(handler, collector);
    const step = { action: "click", selector: "#btn" } as unknown as Step;
    const events: ActionEvent[] = [];

    await wrapped(ctx, step, events, 2);

    expect(collector.recordCursorPosition).not.toHaveBeenCalled();
  });

  it("does not fabricate a target-centre cursor sample when the overlay is missing", async () => {
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const handler: ActionHandler = vi.fn(async (_ctx, _step, events: ActionEvent[]) => {
      events.push({
        action: "click",
        timestamp: 1000,
        duration: 100,
        selector: "#btn",
        boundingBox: { x: 100, y: 200, width: 80, height: 40 },
      });
    });
    const wrapped = wrapWithScreenshotCapture(handler, collector);
    const step = { action: "click", selector: "#btn" } as unknown as Step;

    await wrapped(ctx, step, [], 2);

    expect(collector.recordCursorPosition).not.toHaveBeenCalled();
  });

  it("swallows collector errors (handler still completes)", async () => {
    const handler: ActionHandler = vi.fn().mockResolvedValue(undefined);
    (collector.captureStep as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("screenshot failed"),
    );
    const wrapped = wrapWithScreenshotCapture(handler, collector);
    const step = { action: "type", selector: "#input", text: "hello" } as unknown as Step;
    const events: ActionEvent[] = [];

    // Should not throw
    await wrapped(ctx, step, events, 1);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("swallows collector errors for assert before/after", async () => {
    const handler: ActionHandler = vi.fn().mockResolvedValue(undefined);
    (collector.captureBeforeAssert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("screenshot failed"),
    );
    (collector.captureAfterAssert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("screenshot failed"),
    );
    const wrapped = wrapWithScreenshotCapture(handler, collector);
    const step = { action: "assert", selector: "#result", visible: true } as unknown as Step;
    const events: ActionEvent[] = [];

    // Should not throw
    await wrapped(ctx, step, events, 5);

    expect(handler).toHaveBeenCalledTimes(1);
    // captureStep is still called even if assert screenshots fail
    expect(collector.captureStep).toHaveBeenCalledTimes(1);
  });

  it("swallows collector errors for cursor position recording", async () => {
    const handler: ActionHandler = vi.fn(async (_ctx, _step, events: ActionEvent[]) => {
      events.push({
        action: "click",
        timestamp: 1000,
        duration: 100,
        selector: "#btn",
        boundingBox: { x: 100, y: 200, width: 80, height: 40 },
      });
    });
    (collector.recordCursorPosition as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("recording failed");
    });
    const wrapped = wrapWithScreenshotCapture(handler, collector);
    const step = { action: "click", selector: "#btn" } as unknown as Step;
    const events: ActionEvent[] = [];

    // Should not throw
    await wrapped(ctx, step, events, 2);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("calls the original handler with the correct arguments", async () => {
    const handler: ActionHandler = vi.fn().mockResolvedValue(undefined);
    const wrapped = wrapWithScreenshotCapture(handler, collector);
    const step = { action: "hover", selector: "#menu" } as unknown as Step;
    const events: ActionEvent[] = [];

    await wrapped(ctx, step, events, 7);

    expect(handler).toHaveBeenCalledWith(ctx, step, events, 7);
  });

  it("propagates handler errors (does not swallow them)", async () => {
    const handler: ActionHandler = vi.fn().mockRejectedValue(new Error("click failed"));
    const wrapped = wrapWithScreenshotCapture(handler, collector);
    const step = { action: "click", selector: "#btn" } as unknown as Step;
    const events: ActionEvent[] = [];

    await expect(wrapped(ctx, step, events, 0)).rejects.toThrow("click failed");
  });

  it("does not call captureBeforeAssert/captureAfterAssert for non-assert steps", async () => {
    const handler: ActionHandler = vi.fn().mockResolvedValue(undefined);
    const wrapped = wrapWithScreenshotCapture(handler, collector);
    const step = { action: "type", selector: "#input", text: "hello" } as unknown as Step;
    const events: ActionEvent[] = [];

    await wrapped(ctx, step, events, 1);

    expect(collector.captureBeforeAssert).not.toHaveBeenCalled();
    expect(collector.captureAfterAssert).not.toHaveBeenCalled();
  });

  it("records cursor position for clickFirstVisible steps", async () => {
    (page.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue({ x: 110, y: 75 });
    const handler: ActionHandler = vi.fn(async (_ctx, _step, events: ActionEvent[]) => {
      events.push({
        action: "clickFirstVisible",
        timestamp: 1000,
        duration: 100,
        selector: ".item:visible[nth=0]",
        boundingBox: { x: 50, y: 60, width: 120, height: 30 },
      });
    });
    const wrapped = wrapWithScreenshotCapture(handler, collector);
    const step = {
      action: "clickFirstVisible",
      selector: ".item",
      nth: 0,
    } as unknown as Step;
    const events: ActionEvent[] = [];

    await wrapped(ctx, step, events, 4);

    expect(collector.recordCursorPosition).toHaveBeenCalledWith({
      stepIndex: 4,
      cursorX: 110,
      cursorY: 75,
      targetCenterX: 110,
      targetCenterY: 75,
    });
  });
});

describe("captureChapterTitles", () => {
  it("iterates all chapters and calls captureChapterTitle for each", async () => {
    const page = createMockPage();
    const collector = createMockCollector();
    const chapters = [
      { title: "Chapter 1", steps: [] },
      { title: "Chapter 2", steps: [] },
      { title: "Chapter 3", steps: [] },
    ] as unknown as import("../../src/spec/types.js").Chapter[];

    await captureChapterTitles(collector, page, chapters);

    expect(collector.captureChapterTitle).toHaveBeenCalledTimes(3);
    expect(collector.captureChapterTitle).toHaveBeenCalledWith(0, page);
    expect(collector.captureChapterTitle).toHaveBeenCalledWith(1, page);
    expect(collector.captureChapterTitle).toHaveBeenCalledWith(2, page);
  });

  it("handles empty chapters array", async () => {
    const page = createMockPage();
    const collector = createMockCollector();

    await captureChapterTitles(collector, page, []);

    expect(collector.captureChapterTitle).not.toHaveBeenCalled();
  });

  it("swallows errors from captureChapterTitle", async () => {
    const page = createMockPage();
    const collector = createMockCollector();
    (collector.captureChapterTitle as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("screenshot failed"),
    );
    const chapters = [
      { title: "Chapter 1", steps: [] },
    ] as unknown as import("../../src/spec/types.js").Chapter[];

    // Should not throw
    await captureChapterTitles(collector, page, chapters);
  });
});
