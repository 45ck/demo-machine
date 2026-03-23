import { describe, it, expect, vi, beforeEach } from "vitest";
import { DialogMonitor } from "../../../src/validation/monitors/dialog-monitor.js";

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

function makeDialog(type: string, message: string) {
  return {
    type: () => type,
    message: () => message,
    dismiss: vi.fn().mockResolvedValue(undefined),
  };
}

describe("DialogMonitor", () => {
  let monitor: DialogMonitor;
  let page: ReturnType<typeof createMockPage>;

  beforeEach(() => {
    monitor = new DialogMonitor();
    page = createMockPage();
  });

  it("has name 'dialog'", () => {
    expect(monitor.name).toBe("dialog");
  });

  it("returns no issues initially", () => {
    expect(monitor.issues()).toHaveLength(0);
  });

  it("captures alert dialogs as warn", () => {
    monitor.attach(page);
    page.emit("dialog", makeDialog("alert", "Hello"));
    expect(monitor.issues()).toHaveLength(1);
    expect(monitor.issues()[0].severity).toBe("warn");
  });

  it("captures confirm dialogs as warn", () => {
    monitor.attach(page);
    page.emit("dialog", makeDialog("confirm", "Are you sure?"));
    expect(monitor.issues()).toHaveLength(1);
    expect(monitor.issues()[0].severity).toBe("warn");
  });

  it("captures beforeunload dialogs as error", () => {
    monitor.attach(page);
    page.emit("dialog", makeDialog("beforeunload", "Leave?"));
    expect(monitor.issues()).toHaveLength(1);
    expect(monitor.issues()[0].severity).toBe("error");
  });

  it("auto-dismisses dialogs", () => {
    monitor.attach(page);
    const dialog = makeDialog("alert", "test");
    page.emit("dialog", dialog);
    expect(dialog.dismiss).toHaveBeenCalled();
  });

  it("stops capturing after detach", () => {
    monitor.attach(page);
    monitor.detach();
    page.emit("dialog", makeDialog("alert", "After detach"));
    expect(monitor.issues()).toHaveLength(0);
  });
});
