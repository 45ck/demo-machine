import { describe, it, expect, beforeEach } from "vitest";
import { NetworkMonitor } from "../../../src/validation/monitors/network-monitor.js";

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

describe("NetworkMonitor", () => {
  let monitor: NetworkMonitor;
  let page: ReturnType<typeof createMockPage>;

  beforeEach(() => {
    monitor = new NetworkMonitor();
    page = createMockPage();
  });

  it("has name 'network'", () => {
    expect(monitor.name).toBe("network");
  });

  it("returns no issues initially", () => {
    expect(monitor.issues()).toHaveLength(0);
  });

  it("captures failed requests", () => {
    monitor.attach(page);
    page.emit("requestfailed", {
      url: () => "http://localhost:3000/api/data",
      failure: () => ({ errorText: "net::ERR_CONNECTION_REFUSED" }),
    });
    expect(monitor.issues()).toHaveLength(1);
    expect(monitor.issues()[0].severity).toBe("warn");
    expect(monitor.issues()[0].message).toContain("http://localhost:3000/api/data");
  });

  it("includes error text in message", () => {
    monitor.attach(page);
    page.emit("requestfailed", {
      url: () => "http://example.com",
      failure: () => ({ errorText: "net::ERR_TIMED_OUT" }),
    });
    expect(monitor.issues()[0].message).toContain("net::ERR_TIMED_OUT");
  });

  it("handles null failure", () => {
    monitor.attach(page);
    page.emit("requestfailed", {
      url: () => "http://example.com",
      failure: () => null,
    });
    expect(monitor.issues()).toHaveLength(1);
    expect(monitor.issues()[0].message).toContain("unknown");
  });

  it("captures multiple failed requests", () => {
    monitor.attach(page);
    page.emit("requestfailed", {
      url: () => "http://a.com",
      failure: () => ({ errorText: "err1" }),
    });
    page.emit("requestfailed", {
      url: () => "http://b.com",
      failure: () => ({ errorText: "err2" }),
    });
    expect(monitor.issues()).toHaveLength(2);
  });

  it("stops capturing after detach", () => {
    monitor.attach(page);
    monitor.detach();
    page.emit("requestfailed", {
      url: () => "http://example.com",
      failure: () => ({ errorText: "err" }),
    });
    expect(monitor.issues()).toHaveLength(0);
  });

  it("issues include timestamp", () => {
    monitor.attach(page);
    page.emit("requestfailed", {
      url: () => "http://example.com",
      failure: () => ({ errorText: "err" }),
    });
    expect(monitor.issues()[0].timestamp).toBeDefined();
    expect(typeof monitor.issues()[0].timestamp).toBe("number");
  });

  it("monitor name in issues", () => {
    monitor.attach(page);
    page.emit("requestfailed", {
      url: () => "http://example.com",
      failure: () => ({ errorText: "err" }),
    });
    expect(monitor.issues()[0].monitor).toBe("network");
  });
});
