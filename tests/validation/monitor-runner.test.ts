import { describe, expect, it, vi } from "vitest";
import type { CaptureMonitor, MonitorIssue } from "../../src/validation/monitor-types.js";
import {
  attachMonitorInstances,
  attachMonitors,
  collectIssues,
} from "../../src/validation/monitor-runner.js";

function createMockPage() {
  return {
    on: vi.fn(),
    off: vi.fn(),
  };
}

function createMonitor(overrides: Partial<CaptureMonitor> = {}): CaptureMonitor {
  return {
    name: "test-monitor",
    attach: vi.fn(),
    detach: vi.fn(),
    issues: vi.fn(() => []),
    ...overrides,
  };
}

describe("monitor runner", () => {
  it("attaches the runner-health monitor when runnerUrl is provided", async () => {
    const monitors = await attachMonitors(createMockPage(), { runnerUrl: "http://localhost:3000" });

    expect(monitors.map((m) => m.name)).toContain("runner-health");

    await collectIssues(monitors);
  });

  it("omits the runner-health monitor when runnerUrl is not provided", async () => {
    const monitors = await attachMonitors(createMockPage());

    expect(monitors.map((m) => m.name)).not.toContain("runner-health");

    await collectIssues(monitors);
  });

  it("collects async attach and detach failures as monitor issues", async () => {
    const nativeIssue: MonitorIssue = {
      monitor: "test-monitor",
      severity: "warn",
      message: "native issue",
    };
    const monitor = createMonitor({
      attach: vi.fn(async () => {
        throw new Error("attach failed");
      }),
      detach: vi.fn(async () => {
        throw new Error("detach failed");
      }),
      issues: vi.fn(() => [nativeIssue]),
    });

    const monitors = await attachMonitorInstances(createMockPage(), [monitor]);
    const issues = await collectIssues(monitors);

    expect(monitor.attach).toHaveBeenCalledTimes(1);
    expect(monitor.detach).toHaveBeenCalledTimes(1);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          monitor: "test-monitor",
          severity: "error",
          message: expect.stringContaining("attach failed"),
        }),
        expect.objectContaining({
          monitor: "test-monitor",
          severity: "error",
          message: expect.stringContaining("detach failed"),
        }),
        nativeIssue,
      ]),
    );
  });

  it("surfaces built-in monitor attach failures during issue collection", async () => {
    const page = createMockPage();
    page.on.mockImplementation((event: string) => {
      if (event === "console") throw new Error("listener failed");
    });

    const monitors = await attachMonitors(page);
    const issues = await collectIssues(monitors);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          monitor: "console",
          severity: "error",
          message: expect.stringContaining("listener failed"),
        }),
      ]),
    );
  });
});
