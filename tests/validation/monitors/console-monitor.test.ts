import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConsoleMonitor } from "../../../src/validation/monitors/console-monitor.js";

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

describe("ConsoleMonitor", () => {
  let monitor: ConsoleMonitor;
  let page: ReturnType<typeof createMockPage>;

  beforeEach(() => {
    monitor = new ConsoleMonitor();
    page = createMockPage();
  });

  it("has name 'console'", () => {
    expect(monitor.name).toBe("console");
  });

  it("returns no issues initially", () => {
    expect(monitor.issues()).toHaveLength(0);
  });

  it("captures console.error messages", () => {
    monitor.attach(page);
    page.emit("console", { type: () => "error", text: () => "Something broke" });
    expect(monitor.issues()).toHaveLength(1);
    expect(monitor.issues()[0].severity).toBe("warn");
    expect(monitor.issues()[0].message).toContain("Something broke");
  });

  it("ignores non-error console messages", () => {
    monitor.attach(page);
    page.emit("console", { type: () => "log", text: () => "Debug info" });
    expect(monitor.issues()).toHaveLength(0);
  });

  it("captures page errors with error severity", () => {
    monitor.attach(page);
    page.emit("pageerror", new Error("Uncaught TypeError"));
    expect(monitor.issues()).toHaveLength(1);
    expect(monitor.issues()[0].severity).toBe("error");
    expect(monitor.issues()[0].message).toContain("Uncaught TypeError");
  });

  it("filters React DevTools noise", () => {
    monitor.attach(page);
    page.emit("console", { type: () => "error", text: () => "Download the React DevTools" });
    expect(monitor.issues()).toHaveLength(0);
  });

  it("filters HMR noise", () => {
    monitor.attach(page);
    page.emit("console", { type: () => "error", text: () => "[HMR] Hot module replacement" });
    expect(monitor.issues()).toHaveLength(0);
  });

  it("stops capturing after detach", () => {
    monitor.attach(page);
    monitor.detach();
    page.emit("console", { type: () => "error", text: () => "After detach" });
    expect(monitor.issues()).toHaveLength(0);
  });
});
