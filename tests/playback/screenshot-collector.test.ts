import { describe, it, expect, vi } from "vitest";
import { ScreenshotCollector } from "../../src/playback/screenshot-collector.js";
import type { PlaywrightPage } from "../../src/playback/playwright.js";

vi.mock("../../src/utils/logger.js", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function createMockPage(screenshotBuffer?: Buffer): PlaywrightPage {
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
    screenshot: vi.fn().mockResolvedValue(screenshotBuffer ?? Buffer.from("fake-png")),
    addStyleTag: vi.fn().mockResolvedValue(undefined),
    context: vi.fn(() => ({ addCookies: vi.fn().mockResolvedValue(undefined) })),
  } as unknown as PlaywrightPage;
}

describe("ScreenshotCollector", () => {
  describe("captureStep", () => {
    it("stores a screenshot buffer at the correct step index", async () => {
      const page = createMockPage(Buffer.from("step-0-png"));
      const collector = new ScreenshotCollector();

      await collector.captureStep(0, page);

      const results = collector.getResults();
      expect(results.stepScreenshots.size).toBe(1);
      expect(results.stepScreenshots.get(0)).toEqual(Buffer.from("step-0-png"));
    });

    it("calls page.screenshot()", async () => {
      const page = createMockPage();
      const collector = new ScreenshotCollector();

      await collector.captureStep(0, page);

      expect(page.screenshot).toHaveBeenCalledOnce();
    });
  });

  describe("captureBeforeAssert + captureAfterAssert", () => {
    it("pairs before and after screenshots correctly", async () => {
      const beforeBuf = Buffer.from("before-assert");
      const afterBuf = Buffer.from("after-assert");
      const page = createMockPage();
      (page.screenshot as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(beforeBuf)
        .mockResolvedValueOnce(afterBuf);
      const collector = new ScreenshotCollector();

      await collector.captureBeforeAssert(3, page);
      await collector.captureAfterAssert(3, page);

      const results = collector.getResults();
      expect(results.assertScreenshotPairs).toHaveLength(1);
      expect(results.assertScreenshotPairs[0]).toEqual({
        stepIndex: 3,
        before: beforeBuf,
        after: afterBuf,
      });
    });

    it("handles multiple assert steps", async () => {
      const collector = new ScreenshotCollector();
      const page = createMockPage();
      (page.screenshot as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(Buffer.from("before-1"))
        .mockResolvedValueOnce(Buffer.from("after-1"))
        .mockResolvedValueOnce(Buffer.from("before-5"))
        .mockResolvedValueOnce(Buffer.from("after-5"));

      await collector.captureBeforeAssert(1, page);
      await collector.captureAfterAssert(1, page);
      await collector.captureBeforeAssert(5, page);
      await collector.captureAfterAssert(5, page);

      const results = collector.getResults();
      expect(results.assertScreenshotPairs).toHaveLength(2);
      expect(results.assertScreenshotPairs[0]!.stepIndex).toBe(1);
      expect(results.assertScreenshotPairs[1]!.stepIndex).toBe(5);
    });
  });

  describe("captureAfterAssert without captureBeforeAssert", () => {
    it("does not produce a pair when before screenshot is missing", async () => {
      const page = createMockPage(Buffer.from("after-only"));
      const collector = new ScreenshotCollector();

      await collector.captureAfterAssert(2, page);

      const results = collector.getResults();
      expect(results.assertScreenshotPairs).toHaveLength(0);
    });
  });

  describe("recordCursorPosition", () => {
    it("stores cursor position data", () => {
      const collector = new ScreenshotCollector();

      collector.recordCursorPosition({
        stepIndex: 4,
        cursorX: 100,
        cursorY: 200,
        targetCenterX: 110,
        targetCenterY: 210,
      });

      const results = collector.getResults();
      expect(results.cursorPositions).toHaveLength(1);
      expect(results.cursorPositions[0]).toEqual({
        stepIndex: 4,
        cursorX: 100,
        cursorY: 200,
        targetCenterX: 110,
        targetCenterY: 210,
      });
    });

    it("accumulates multiple cursor positions", () => {
      const collector = new ScreenshotCollector();

      collector.recordCursorPosition({
        stepIndex: 0,
        cursorX: 10,
        cursorY: 20,
        targetCenterX: 15,
        targetCenterY: 25,
      });
      collector.recordCursorPosition({
        stepIndex: 3,
        cursorX: 50,
        cursorY: 60,
        targetCenterX: 55,
        targetCenterY: 65,
      });
      collector.recordCursorPosition({
        stepIndex: 7,
        cursorX: 200,
        cursorY: 300,
        targetCenterX: 210,
        targetCenterY: 310,
      });

      const results = collector.getResults();
      expect(results.cursorPositions).toHaveLength(3);
      expect(results.cursorPositions[0]!.stepIndex).toBe(0);
      expect(results.cursorPositions[1]!.stepIndex).toBe(3);
      expect(results.cursorPositions[2]!.stepIndex).toBe(7);
    });
  });

  describe("captureChapterTitle", () => {
    it("stores a chapter title screenshot at the correct index", async () => {
      const page = createMockPage(Buffer.from("chapter-0-png"));
      const collector = new ScreenshotCollector();

      await collector.captureChapterTitle(0, page);

      const results = collector.getResults();
      expect(results.chapterTitleScreenshots.size).toBe(1);
      expect(results.chapterTitleScreenshots.get(0)).toEqual(Buffer.from("chapter-0-png"));
    });

    it("stores multiple chapter title screenshots", async () => {
      const collector = new ScreenshotCollector();
      const page = createMockPage();
      (page.screenshot as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(Buffer.from("ch-0"))
        .mockResolvedValueOnce(Buffer.from("ch-1"))
        .mockResolvedValueOnce(Buffer.from("ch-2"));

      await collector.captureChapterTitle(0, page);
      await collector.captureChapterTitle(1, page);
      await collector.captureChapterTitle(2, page);

      const results = collector.getResults();
      expect(results.chapterTitleScreenshots.size).toBe(3);
      expect(results.chapterTitleScreenshots.get(0)).toEqual(Buffer.from("ch-0"));
      expect(results.chapterTitleScreenshots.get(1)).toEqual(Buffer.from("ch-1"));
      expect(results.chapterTitleScreenshots.get(2)).toEqual(Buffer.from("ch-2"));
    });
  });

  describe("getResults", () => {
    it("returns correct shape with all fields", async () => {
      const collector = new ScreenshotCollector();
      const page = createMockPage(Buffer.from("data"));

      await collector.captureStep(0, page);
      collector.recordCursorPosition({
        stepIndex: 0,
        cursorX: 1,
        cursorY: 2,
        targetCenterX: 3,
        targetCenterY: 4,
      });
      await collector.captureChapterTitle(0, page);

      const results = collector.getResults();
      expect(results).toHaveProperty("stepScreenshots");
      expect(results).toHaveProperty("assertScreenshotPairs");
      expect(results).toHaveProperty("cursorPositions");
      expect(results).toHaveProperty("chapterTitleScreenshots");
      expect(results.stepScreenshots).toBeInstanceOf(Map);
      expect(results.chapterTitleScreenshots).toBeInstanceOf(Map);
      expect(Array.isArray(results.assertScreenshotPairs)).toBe(true);
      expect(Array.isArray(results.cursorPositions)).toBe(true);
    });

    it("returns empty collections when nothing has been captured", () => {
      const collector = new ScreenshotCollector();

      const results = collector.getResults();

      expect(results.stepScreenshots.size).toBe(0);
      expect(results.assertScreenshotPairs).toHaveLength(0);
      expect(results.cursorPositions).toHaveLength(0);
      expect(results.chapterTitleScreenshots.size).toBe(0);
    });
  });

  describe("reset", () => {
    it("clears all collected data", async () => {
      const collector = new ScreenshotCollector();
      const page = createMockPage(Buffer.from("data"));

      await collector.captureStep(0, page);
      await collector.captureBeforeAssert(1, page);
      await collector.captureAfterAssert(1, page);
      collector.recordCursorPosition({
        stepIndex: 2,
        cursorX: 10,
        cursorY: 20,
        targetCenterX: 30,
        targetCenterY: 40,
      });
      await collector.captureChapterTitle(0, page);

      collector.reset();

      const results = collector.getResults();
      expect(results.stepScreenshots.size).toBe(0);
      expect(results.assertScreenshotPairs).toHaveLength(0);
      expect(results.cursorPositions).toHaveLength(0);
      expect(results.chapterTitleScreenshots.size).toBe(0);
    });

    it("allows collecting new data after reset", async () => {
      const collector = new ScreenshotCollector();
      const page = createMockPage(Buffer.from("first-run"));

      await collector.captureStep(0, page);
      collector.reset();

      (page.screenshot as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from("second-run"));
      await collector.captureStep(0, page);

      const results = collector.getResults();
      expect(results.stepScreenshots.get(0)).toEqual(Buffer.from("second-run"));
    });
  });

  describe("error handling", () => {
    it("swallows screenshot errors in captureStep", async () => {
      const page = createMockPage();
      (page.screenshot as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("page crashed"));
      const collector = new ScreenshotCollector();

      // Should not throw
      await expect(collector.captureStep(0, page)).resolves.toBeUndefined();

      const results = collector.getResults();
      expect(results.stepScreenshots.size).toBe(0);
    });

    it("swallows screenshot errors in captureBeforeAssert", async () => {
      const page = createMockPage();
      (page.screenshot as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("frame detached"));
      const collector = new ScreenshotCollector();

      await expect(collector.captureBeforeAssert(0, page)).resolves.toBeUndefined();
    });

    it("swallows screenshot errors in captureAfterAssert", async () => {
      const page = createMockPage();
      (page.screenshot as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("target closed"));
      const collector = new ScreenshotCollector();

      await expect(collector.captureAfterAssert(0, page)).resolves.toBeUndefined();
    });

    it("swallows screenshot errors in captureChapterTitle", async () => {
      const page = createMockPage();
      (page.screenshot as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("browser disconnected"),
      );
      const collector = new ScreenshotCollector();

      await expect(collector.captureChapterTitle(0, page)).resolves.toBeUndefined();

      const results = collector.getResults();
      expect(results.chapterTitleScreenshots.size).toBe(0);
    });
  });

  describe("multiple steps accumulate correctly", () => {
    it("accumulates step screenshots across multiple calls", async () => {
      const collector = new ScreenshotCollector();
      const page = createMockPage();
      (page.screenshot as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(Buffer.from("step-0"))
        .mockResolvedValueOnce(Buffer.from("step-1"))
        .mockResolvedValueOnce(Buffer.from("step-2"));

      await collector.captureStep(0, page);
      await collector.captureStep(1, page);
      await collector.captureStep(2, page);

      const results = collector.getResults();
      expect(results.stepScreenshots.size).toBe(3);
      expect(results.stepScreenshots.get(0)).toEqual(Buffer.from("step-0"));
      expect(results.stepScreenshots.get(1)).toEqual(Buffer.from("step-1"));
      expect(results.stepScreenshots.get(2)).toEqual(Buffer.from("step-2"));
    });

    it("handles interleaved step and assert captures", async () => {
      const collector = new ScreenshotCollector();
      const page = createMockPage();
      (page.screenshot as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(Buffer.from("step-0"))
        .mockResolvedValueOnce(Buffer.from("before-assert-1"))
        .mockResolvedValueOnce(Buffer.from("after-assert-1"))
        .mockResolvedValueOnce(Buffer.from("step-2"));

      await collector.captureStep(0, page);
      await collector.captureBeforeAssert(1, page);
      await collector.captureAfterAssert(1, page);
      await collector.captureStep(2, page);

      const results = collector.getResults();
      expect(results.stepScreenshots.size).toBe(2);
      expect(results.assertScreenshotPairs).toHaveLength(1);
      expect(results.assertScreenshotPairs[0]!.stepIndex).toBe(1);
    });
  });

  describe("captureAfterAssert when before screenshot failed", () => {
    it("does not produce a pair when before screenshot threw", async () => {
      const collector = new ScreenshotCollector();
      const page = createMockPage();

      // First call (captureBeforeAssert) fails
      (page.screenshot as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("page crashed"),
      );
      await collector.captureBeforeAssert(2, page);

      // Second call (captureAfterAssert) succeeds
      (page.screenshot as ReturnType<typeof vi.fn>).mockResolvedValueOnce(Buffer.from("after"));
      await collector.captureAfterAssert(2, page);

      const results = collector.getResults();
      expect(results.assertScreenshotPairs).toHaveLength(0);
    });
  });

  describe("unpaired before screenshot", () => {
    it("does not include incomplete pairs when captureAfterAssert is never called", async () => {
      const collector = new ScreenshotCollector();
      const page = createMockPage(Buffer.from("before-only"));

      // Only capture before, never capture after
      await collector.captureBeforeAssert(5, page);

      const results = collector.getResults();
      // Should have zero complete pairs
      expect(results.assertScreenshotPairs).toHaveLength(0);
    });

    it("does not leak pending before buffers across reset", async () => {
      const collector = new ScreenshotCollector();
      const page = createMockPage(Buffer.from("data"));

      await collector.captureBeforeAssert(0, page);
      collector.reset();

      // After reset, captureAfterAssert should not find the old before buffer
      await collector.captureAfterAssert(0, page);

      const results = collector.getResults();
      expect(results.assertScreenshotPairs).toHaveLength(0);
    });
  });
});
