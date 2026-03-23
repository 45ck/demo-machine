import { describe, it, expect, beforeEach } from "vitest";
import { PageLifecycleMonitor } from "../../../src/validation/monitors/page-lifecycle-monitor.js";

function createMockPage() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(handler);
    },
    emit(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach((h) => h(...args));
    },
  };
}

describe("PageLifecycleMonitor", () => {
  let monitor: PageLifecycleMonitor;
  let page: ReturnType<typeof createMockPage>;

  beforeEach(() => {
    monitor = new PageLifecycleMonitor();
    page = createMockPage();
  });

  it("has name 'page-lifecycle'", () => {
    expect(monitor.name).toBe("page-lifecycle");
  });

  it("captures unexpected page close", () => {
    monitor.attach(page);
    page.emit("close");
    expect(monitor.issues()).toHaveLength(1);
    expect(monitor.issues()[0].severity).toBe("error");
    expect(monitor.issues()[0].message).toContain("closed");
  });

  it("captures page crash", () => {
    monitor.attach(page);
    page.emit("crash");
    expect(monitor.issues()).toHaveLength(1);
    expect(monitor.issues()[0].severity).toBe("error");
    expect(monitor.issues()[0].message).toContain("crashed");
  });

  it("stops capturing after detach", () => {
    monitor.attach(page);
    monitor.detach();
    page.emit("close");
    page.emit("crash");
    expect(monitor.issues()).toHaveLength(0);
  });

  it("returns no issues when nothing happens", () => {
    monitor.attach(page);
    expect(monitor.issues()).toHaveLength(0);
  });
});
