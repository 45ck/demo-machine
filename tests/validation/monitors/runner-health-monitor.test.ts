import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RunnerHealthMonitor } from "../../../src/validation/monitors/runner-health-monitor.js";

describe("RunnerHealthMonitor", () => {
  let monitor: RunnerHealthMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    monitor = new RunnerHealthMonitor("http://localhost:3000");
  });

  afterEach(() => {
    monitor.detach();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("has name 'runner-health'", () => {
    expect(monitor.name).toBe("runner-health");
  });

  it("returns no issues initially", () => {
    expect(monitor.issues()).toHaveLength(0);
  });

  it("records issue when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    monitor.attach({});
    await vi.advanceTimersByTimeAsync(5000);
    expect(monitor.issues()).toHaveLength(1);
    expect(monitor.issues()[0].severity).toBe("error");
    expect(monitor.issues()[0].message).toContain("ECONNREFUSED");
  });

  it("records warn when response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);
    monitor.attach({});
    await vi.advanceTimersByTimeAsync(5000);
    expect(monitor.issues()).toHaveLength(1);
    expect(monitor.issues()[0].severity).toBe("warn");
    expect(monitor.issues()[0].message).toContain("503");
  });

  it("no issues when fetch succeeds", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    monitor.attach({});
    await vi.advanceTimersByTimeAsync(5000);
    expect(monitor.issues()).toHaveLength(0);
  });

  it("stops checking after detach", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    monitor.attach({});
    monitor.detach();
    await vi.advanceTimersByTimeAsync(10000);
    // Should not have been called because we detached immediately
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
