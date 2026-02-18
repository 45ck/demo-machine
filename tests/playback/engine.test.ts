import { describe, it, expect, vi, beforeEach } from "vitest";
import { actionHandlers } from "../../src/playback/actions.js";
import type { PlaywrightPage, PlaybackContext } from "../../src/playback/actions.js";
import { PlaybackEngine } from "../../src/playback/engine.js";
import type { Chapter } from "../../src/spec/types.js";
import type { ActionEvent, BoundingBox, Pacing } from "../../src/playback/types.js";

vi.mock("../../src/redaction/mask.js", () => ({
  generateBlurStyles: vi.fn((selectors: string[]) =>
    selectors.map((s: string) => `${s} { filter: blur(10px); }`).join("\n"),
  ),
}));

vi.mock("../../src/redaction/secrets.js", () => ({
  scanForSecrets: vi.fn(() => []),
}));

const TEST_PACING: Pacing = {
  cursorDurationMs: 600,
  typeDelayMs: 50,
  postClickDelayMs: 500,
  postTypeDelayMs: 300,
  postNavigateDelayMs: 1000,
  settleDelayMs: 200,
};

function createMockPage(): PlaywrightPage {
  return {
    goto: vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined),
    click: vi.fn<(s: string) => Promise<void>>().mockResolvedValue(undefined),
    fill: vi.fn<(s: string, v: string) => Promise<void>>().mockResolvedValue(undefined),
    hover: vi.fn<(s: string) => Promise<void>>().mockResolvedValue(undefined),
    keyboard: {
      press: vi.fn<(k: string) => Promise<void>>().mockResolvedValue(undefined),
      type: vi
        .fn<(text: string, options?: { delay?: number | undefined }) => Promise<void>>()
        .mockResolvedValue(undefined),
    },
    waitForTimeout: vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined),
    locator: vi.fn().mockReturnValue({
      isVisible: vi.fn().mockResolvedValue(true),
      textContent: vi.fn().mockResolvedValue("hello world"),
      boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 100, height: 50 }),
    }),
    evaluate: vi.fn().mockResolvedValue("page text content"),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("")),
    addStyleTag: vi.fn<(o: { content: string }) => Promise<void>>().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue({
      boundingBox: vi.fn().mockResolvedValue({ x: 10, y: 20, width: 100, height: 50 }),
    }),
  };
}

function createMockContext(page?: PlaywrightPage): PlaybackContext {
  const p = page ?? createMockPage();
  return {
    page: p,
    pacing: TEST_PACING,
    moveCursorTo: vi.fn<(box: BoundingBox | null) => Promise<void>>().mockResolvedValue(undefined),
    reinjectCursor: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    waitAfterStep: vi
      .fn<(stepIndex: number, step: Chapter["steps"][number]) => Promise<void>>()
      .mockImplementation(async (_stepIndex, step) => {
        let delay = 0;
        switch (step.action) {
          case "navigate":
            delay = TEST_PACING.postNavigateDelayMs;
            break;
          case "click":
          case "hover":
          case "scroll":
          case "press":
            delay = (step as { delay?: number | undefined }).delay ?? TEST_PACING.postClickDelayMs;
            break;
          case "type":
            delay = (step as { delay?: number | undefined }).delay ?? TEST_PACING.postTypeDelayMs;
            break;
          default:
            delay = 0;
        }
        if (delay > 0) await p.waitForTimeout(delay);
      }),
  };
}

describe("actionHandlers", () => {
  let ctx: PlaybackContext;
  let events: ActionEvent[];

  beforeEach(() => {
    ctx = createMockContext();
    events = [];
  });

  it("handles navigate action", async () => {
    const step = { action: "navigate" as const, url: "https://example.com" };
    await actionHandlers["navigate"]!(ctx, step, events, 0);
    expect(ctx.page.goto).toHaveBeenCalledWith("https://example.com");
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe("navigate");
  });

  it("reinjects cursor after navigate", async () => {
    const step = { action: "navigate" as const, url: "https://example.com" };
    await actionHandlers["navigate"]!(ctx, step, events, 0);
    expect(ctx.reinjectCursor).toHaveBeenCalled();
  });

  it("handles click action with bounding box", async () => {
    const step = { action: "click" as const, selector: "#btn" };
    await actionHandlers["click"]!(ctx, step, events, 0);
    expect(ctx.moveCursorTo).toHaveBeenCalled();
    expect(ctx.page.click).toHaveBeenCalledWith("#btn");
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe("click");
    expect(events[0]!.selector).toBe("#btn");
    expect(events[0]!.boundingBox).toBeDefined();
  });

  it("handles type action with character-by-character typing", async () => {
    const step = { action: "type" as const, selector: "#input", text: "hello" };
    await actionHandlers["type"]!(ctx, step, events, 0);
    expect(ctx.moveCursorTo).toHaveBeenCalled();
    expect(ctx.page.click).toHaveBeenCalledWith("#input");
    expect(ctx.page.keyboard.type).toHaveBeenCalledWith("hello", { delay: 50 });
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe("type");
  });

  it("handles hover action", async () => {
    const step = { action: "hover" as const, selector: ".menu" };
    await actionHandlers["hover"]!(ctx, step, events, 0);
    expect(ctx.moveCursorTo).toHaveBeenCalled();
    expect(ctx.page.hover).toHaveBeenCalledWith(".menu");
    expect(events).toHaveLength(1);
  });

  it("handles scroll action with selector", async () => {
    const step = { action: "scroll" as const, selector: "#section", x: 0, y: 0 };
    await actionHandlers["scroll"]!(ctx, step, events, 0);
    expect(ctx.page.evaluate).toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe("scroll");
  });

  it("handles scroll action without selector", async () => {
    const step = { action: "scroll" as const, x: 0, y: 200 };
    await actionHandlers["scroll"]!(ctx, step, events, 0);
    expect(ctx.page.evaluate).toHaveBeenCalled();
    expect(events).toHaveLength(1);
  });

  it("handles wait action", async () => {
    const step = { action: "wait" as const, timeout: 1000 };
    await actionHandlers["wait"]!(ctx, step, events, 0);
    expect(ctx.page.waitForTimeout).toHaveBeenCalledWith(1000);
    expect(events).toHaveLength(1);
  });

  it("handles assert action with visibility", async () => {
    const step = { action: "assert" as const, selector: "#el", visible: true };
    await actionHandlers["assert"]!(ctx, step, events, 0);
    expect(ctx.page.locator).toHaveBeenCalledWith("#el");
    expect(events).toHaveLength(1);
  });

  it("throws on failed visibility assertion", async () => {
    ctx.page.locator = vi.fn().mockReturnValue({
      isVisible: vi.fn().mockResolvedValue(false),
      textContent: vi.fn().mockResolvedValue(null),
      boundingBox: vi.fn().mockResolvedValue(null),
    });
    const step = { action: "assert" as const, selector: "#el", visible: true };
    await expect(actionHandlers["assert"]!(ctx, step, events, 0)).rejects.toThrow(
      "Assertion failed",
    );
  });

  it("handles screenshot action", async () => {
    const step = { action: "screenshot" as const };
    await actionHandlers["screenshot"]!(ctx, step, events, 0);
    expect(ctx.page.screenshot).toHaveBeenCalled();
    expect(events).toHaveLength(1);
  });

  it("handles press action", async () => {
    const step = { action: "press" as const, key: "Enter" };
    await actionHandlers["press"]!(ctx, step, events, 0);
    expect(ctx.page.keyboard.press).toHaveBeenCalledWith("Enter");
    expect(events).toHaveLength(1);
  });

  it("applies post-action delay using step.delay override", async () => {
    const step = { action: "click" as const, selector: "#btn", delay: 100 };
    await actionHandlers["click"]!(ctx, step, events, 0);
    expect(ctx.page.waitForTimeout).toHaveBeenCalledWith(100);
  });

  it("applies default post-action delay when no step.delay", async () => {
    const step = { action: "click" as const, selector: "#btn" };
    await actionHandlers["click"]!(ctx, step, events, 0);
    expect(ctx.page.waitForTimeout).toHaveBeenCalledWith(TEST_PACING.postClickDelayMs);
  });
});

describe("PlaybackEngine", () => {
  let page: PlaywrightPage;

  beforeEach(() => {
    page = createMockPage();
  });

  it("executes chapters in order and returns result", async () => {
    const chapters: Chapter[] = [
      {
        title: "Chapter 1",
        steps: [
          { action: "navigate", url: "https://example.com" },
          { action: "click", selector: "#btn" },
        ],
      },
    ];

    const engine = new PlaybackEngine(page, { baseUrl: "https://example.com" });
    const result = await engine.execute(chapters);

    expect(result.events).toHaveLength(2);
    expect(result.events[0]!.action).toBe("navigate");
    expect(result.events[1]!.action).toBe("click");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("applies redaction CSS at start", async () => {
    const chapters: Chapter[] = [
      {
        title: "Test",
        steps: [{ action: "navigate", url: "https://example.com" }],
      },
    ];

    const engine = new PlaybackEngine(page, {
      baseUrl: "https://example.com",
      redactionSelectors: [".secret"],
    });
    await engine.execute(chapters);

    expect(page.addStyleTag).toHaveBeenCalled();
  });

  it("does not apply redaction when no selectors given", async () => {
    const chapters: Chapter[] = [
      {
        title: "Test",
        steps: [{ action: "wait", timeout: 100 }],
      },
    ];

    const engine = new PlaybackEngine(page, { baseUrl: "https://example.com" });
    await engine.execute(chapters);

    expect(page.addStyleTag).not.toHaveBeenCalled();
  });

  it("injects cursor CSS when pacing is provided", async () => {
    const chapters: Chapter[] = [
      {
        title: "Test",
        steps: [{ action: "wait", timeout: 100 }],
      },
    ];

    const engine = new PlaybackEngine(page, {
      baseUrl: "https://example.com",
      pacing: TEST_PACING,
    });
    await engine.execute(chapters);

    expect(page.addStyleTag).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("#dm-cursor") }),
    );
  });

  it("executes multiple chapters sequentially", async () => {
    const chapters: Chapter[] = [
      {
        title: "First",
        steps: [{ action: "navigate", url: "https://example.com" }],
      },
      {
        title: "Second",
        steps: [{ action: "click", selector: "#next" }],
      },
    ];

    const engine = new PlaybackEngine(page, { baseUrl: "https://example.com" });
    const result = await engine.execute(chapters);

    expect(result.events).toHaveLength(2);
    expect(result.events[0]!.action).toBe("navigate");
    expect(result.events[1]!.action).toBe("click");
  });

  it("preserves narration in events", async () => {
    const chapters: Chapter[] = [
      {
        title: "Narrated",
        steps: [{ action: "navigate", url: "https://example.com", narration: "Go to homepage" }],
      },
    ];

    const engine = new PlaybackEngine(page, { baseUrl: "https://example.com" });
    const result = await engine.execute(chapters);

    expect(result.events[0]!.narration).toBe("Go to homepage");
  });

  it("applies settle delay after each step when pacing is set", async () => {
    const chapters: Chapter[] = [
      {
        title: "Test",
        steps: [{ action: "wait", timeout: 100 }],
      },
    ];

    const engine = new PlaybackEngine(page, {
      baseUrl: "https://example.com",
      pacing: TEST_PACING,
    });
    await engine.execute(chapters);

    expect(page.waitForTimeout).toHaveBeenCalledWith(TEST_PACING.settleDelayMs);
  });

  it("calls onStepComplete after each step", async () => {
    const chapters: Chapter[] = [
      {
        title: "Test",
        steps: [
          { action: "navigate", url: "https://example.com" },
          { action: "click", selector: "#btn" },
        ],
      },
    ];

    const onStepComplete = vi
      .fn<(event: ActionEvent) => Promise<void>>()
      .mockResolvedValue(undefined);

    const engine = new PlaybackEngine(page, {
      baseUrl: "https://example.com",
      onStepComplete,
    });
    await engine.execute(chapters);

    expect(onStepComplete).toHaveBeenCalledTimes(2);
    expect(onStepComplete.mock.calls[0]![0]!.action).toBe("navigate");
    expect(onStepComplete.mock.calls[1]![0]!.action).toBe("click");
  });

  it("does not call onStepComplete when not provided", async () => {
    const chapters: Chapter[] = [
      {
        title: "Test",
        steps: [{ action: "navigate", url: "https://example.com" }],
      },
    ];

    const engine = new PlaybackEngine(page, { baseUrl: "https://example.com" });
    // Should not throw
    const result = await engine.execute(chapters);
    expect(result.events).toHaveLength(1);
  });

  it("propagates onStepComplete errors", async () => {
    const chapters: Chapter[] = [
      {
        title: "Test",
        steps: [{ action: "navigate", url: "https://example.com" }],
      },
    ];

    const callbackError = new Error("callback failed");
    const onStepComplete = vi
      .fn<(event: ActionEvent) => Promise<void>>()
      .mockRejectedValue(callbackError);

    const engine = new PlaybackEngine(page, {
      baseUrl: "https://example.com",
      onStepComplete,
    });

    await expect(engine.execute(chapters)).rejects.toThrow(callbackError);
  });

  it("returns empty events for empty chapters array", async () => {
    const engine = new PlaybackEngine(page, { baseUrl: "https://example.com" });
    const result = await engine.execute([]);

    expect(result.events).toEqual([]);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
