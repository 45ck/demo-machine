import { describe, it, expect, vi } from "vitest";
import { ChangeDetectionOrchestrator } from "../../../src/playback/change-detection/orchestrator.js";
import { NoVisibleChangeError } from "../../../src/playback/errors.js";
import type { ChangeDetectionConfig } from "../../../src/playback/change-detection/types.js";
import type { PlaywrightPage } from "../../../src/playback/actions.js";
import type { Step } from "../../../src/spec/types.js";

vi.mock("../../../src/playback/change-detection/registry.js", () => ({
  createDetectors: vi.fn(() => []),
  isKnownDetector: vi.fn(() => true),
}));

function createMockPage(): PlaywrightPage {
  return {
    evaluate: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    keyboard: { press: vi.fn(), type: vi.fn() },
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn(),
    getByRole: vi.fn(),
    getByText: vi.fn(),
    getByTestId: vi.fn(),
    getByLabel: vi.fn(),
    getByPlaceholder: vi.fn(),
    getByAltText: vi.fn(),
    getByTitle: vi.fn(),
    screenshot: vi.fn(),
    addStyleTag: vi.fn(),
    context: vi.fn(),
  };
}

const defaultConfig: ChangeDetectionConfig = {
  mode: "error",
  detectors: ["dom-mutation"],
  mutationWaitMs: 0,
  screenshotThreshold: 0.001,
};

describe("ChangeDetectionOrchestrator", () => {
  describe("shouldCheck", () => {
    it("returns true for interactive actions", () => {
      const orch = new ChangeDetectionOrchestrator(defaultConfig);
      const step = { action: "click", selector: "#btn" } as Step;
      expect(orch.shouldCheck(step)).toBe(true);
    });

    it("returns false for non-interactive actions", () => {
      const orch = new ChangeDetectionOrchestrator(defaultConfig);
      expect(orch.shouldCheck({ action: "navigate", url: "/foo" } as Step)).toBe(false);
      expect(orch.shouldCheck({ action: "wait", timeout: 100 } as Step)).toBe(false);
      expect(orch.shouldCheck({ action: "assert", selector: "#el", visible: true } as Step)).toBe(
        false,
      );
      expect(orch.shouldCheck({ action: "screenshot" } as Step)).toBe(false);
      expect(orch.shouldCheck({ action: "press", key: "Enter" } as Step)).toBe(false);
    });

    it("returns true for all interactive action types", () => {
      const orch = new ChangeDetectionOrchestrator(defaultConfig);
      const interactive = [
        { action: "click", selector: "#a" },
        { action: "clickFirstVisible", selector: ".b" },
        { action: "type", selector: "#c", text: "x" },
        { action: "select", selector: "#d", option: { value: "v" } },
        { action: "selectFirstNonPlaceholder", selector: "#e" },
        { action: "check", selector: "#f" },
        { action: "uncheck", selector: "#g" },
        { action: "upload", selector: "#h", file: "x.txt" },
        { action: "dragAndDrop", from: { selector: "#i" }, to: { selector: "#j" } },
        { action: "hover", selector: "#x" },
        { action: "scroll", selector: "#y", x: 0, y: 200 },
      ];
      for (const step of interactive) {
        expect(orch.shouldCheck(step as Step)).toBe(true);
      }
    });

    it("returns false when mode is off", () => {
      const orch = new ChangeDetectionOrchestrator({ ...defaultConfig, mode: "off" });
      expect(orch.shouldCheck({ action: "click", selector: "#btn" } as Step)).toBe(false);
    });

    it("returns false when expectVisualChange is false", () => {
      const orch = new ChangeDetectionOrchestrator(defaultConfig);
      const step = { action: "click", selector: "#btn", expectVisualChange: false } as Step;
      expect(orch.shouldCheck(step)).toBe(false);
    });
  });

  describe("before/after lifecycle", () => {
    it("calls before on all detectors and collects after signals", async () => {
      const { createDetectors } =
        await import("../../../src/playback/change-detection/registry.js");
      const mockDetector = {
        name: "test-detector",
        before: vi.fn().mockResolvedValue(undefined),
        after: vi.fn().mockResolvedValue({
          detector: "test-detector",
          changesDetected: true,
          confidence: 1,
          details: "something changed",
        }),
      };
      vi.mocked(createDetectors).mockReturnValue([mockDetector]);

      const orch = new ChangeDetectionOrchestrator(defaultConfig);
      const page = createMockPage();
      const step = { action: "click", selector: "#btn" } as Step;

      await orch.before(page, step);
      expect(mockDetector.before).toHaveBeenCalledWith(page, step);

      const signals = await orch.after({
        page,
        step,
        stepIndex: 0,
        chapterTitle: "Test",
      });

      expect(mockDetector.after).toHaveBeenCalledWith(page, step);
      expect(signals).toHaveLength(1);
      expect(signals[0]!.changesDetected).toBe(true);
    });

    it("throws NoVisibleChangeError when no detector sees changes and mode is error", async () => {
      const { createDetectors } =
        await import("../../../src/playback/change-detection/registry.js");
      vi.mocked(createDetectors).mockReturnValue([
        {
          name: "silent-detector",
          before: vi.fn().mockResolvedValue(undefined),
          after: vi.fn().mockResolvedValue({
            detector: "silent-detector",
            changesDetected: false,
            confidence: 0,
            details: "nothing happened",
          }),
        },
      ]);

      const orch = new ChangeDetectionOrchestrator({ ...defaultConfig, mode: "error" });
      const page = createMockPage();
      const step = { action: "click", selector: "#btn" } as Step;

      await orch.before(page, step);

      await expect(orch.after({ page, step, stepIndex: 3, chapterTitle: "Demo" })).rejects.toThrow(
        NoVisibleChangeError,
      );
    });

    it("warns but does not throw when mode is warn", async () => {
      const { createDetectors } =
        await import("../../../src/playback/change-detection/registry.js");
      vi.mocked(createDetectors).mockReturnValue([
        {
          name: "silent-detector",
          before: vi.fn().mockResolvedValue(undefined),
          after: vi.fn().mockResolvedValue({
            detector: "silent-detector",
            changesDetected: false,
            confidence: 0,
            details: "nothing happened",
          }),
        },
      ]);

      const orch = new ChangeDetectionOrchestrator({ ...defaultConfig, mode: "warn" });
      const page = createMockPage();
      const step = { action: "click", selector: "#btn" } as Step;

      await orch.before(page, step);
      const signals = await orch.after({ page, step, stepIndex: 0, chapterTitle: "Test" });

      expect(signals).toHaveLength(1);
      expect(signals[0]!.changesDetected).toBe(false);
    });

    it("passes when at least one detector reports changes (optimistic OR)", async () => {
      const { createDetectors } =
        await import("../../../src/playback/change-detection/registry.js");
      vi.mocked(createDetectors).mockReturnValue([
        {
          name: "silent",
          before: vi.fn().mockResolvedValue(undefined),
          after: vi.fn().mockResolvedValue({
            detector: "silent",
            changesDetected: false,
            confidence: 0,
            details: "nope",
          }),
        },
        {
          name: "active",
          before: vi.fn().mockResolvedValue(undefined),
          after: vi.fn().mockResolvedValue({
            detector: "active",
            changesDetected: true,
            confidence: 0.8,
            details: "yes",
          }),
        },
      ]);

      const orch = new ChangeDetectionOrchestrator({ ...defaultConfig, mode: "error" });
      const page = createMockPage();
      const step = { action: "click", selector: "#btn" } as Step;

      await orch.before(page, step);
      const signals = await orch.after({ page, step, stepIndex: 0, chapterTitle: "Test" });

      // Should NOT throw despite one detector seeing nothing
      expect(signals).toHaveLength(2);
      expect(signals.some((s) => s.changesDetected)).toBe(true);
    });

    it("waits mutationWaitMs before collecting signals", async () => {
      const { createDetectors } =
        await import("../../../src/playback/change-detection/registry.js");
      vi.mocked(createDetectors).mockReturnValue([
        {
          name: "d",
          before: vi.fn().mockResolvedValue(undefined),
          after: vi.fn().mockResolvedValue({
            detector: "d",
            changesDetected: true,
            confidence: 1,
            details: "ok",
          }),
        },
      ]);

      const config = { ...defaultConfig, mutationWaitMs: 150 };
      const orch = new ChangeDetectionOrchestrator(config);
      const page = createMockPage();
      const step = { action: "click", selector: "#btn" } as Step;

      await orch.before(page, step);
      await orch.after({ page, step, stepIndex: 0, chapterTitle: "Test" });

      expect(page.waitForTimeout).toHaveBeenCalledWith(150);
    });
  });
});
