import { afterEach, describe, expect, it, vi } from "vitest";
import { VIEWER_SCRIPT } from "../../src/share/script.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("share viewer client", () => {
  it("is valid self-contained JavaScript with the expected local interactions", () => {
    expect(() => new Function(VIEWER_SCRIPT)).not.toThrow();
    expect(VIEWER_SCRIPT).toContain('searchParams.set("t"');
    expect(VIEWER_SCRIPT).toContain("data-transcript-start");
    expect(VIEWER_SCRIPT).toContain("navigator.clipboard");
    expect(VIEWER_SCRIPT).toContain("video.playbackRate");
    expect(VIEWER_SCRIPT).toContain('video.addEventListener("ended"');
  });

  it("does not contain network, analytics, cookie, or storage clients", () => {
    expect(VIEWER_SCRIPT).not.toMatch(/\bfetch\s*\(/);
    expect(VIEWER_SCRIPT).not.toContain("XMLHttpRequest");
    expect(VIEWER_SCRIPT).not.toContain("sendBeacon");
    expect(VIEWER_SCRIPT).not.toContain("document.cookie");
    expect(VIEWER_SCRIPT).not.toContain("localStorage");
    expect(VIEWER_SCRIPT).not.toContain("sessionStorage");
  });

  it("ignores character shortcuts until the video player has focus", () => {
    class FakeElement {
      closest(): null {
        return null;
      }
    }
    class FakeVideo extends FakeElement {
      currentTime = 0;
      duration = Number.NaN;
      dataset = { durationMs: "8000" };
      paused = true;
      muted = false;
      readyState = 0;
      textTracks: Array<{ mode: string }> = [];
      playbackRate = 1;
      listeners: Record<string, (...args: unknown[]) => void> = {};
      addEventListener(name: string, listener: (...args: unknown[]) => void): void {
        this.listeners[name] = listener;
      }
      play(): Promise<void> {
        return Promise.resolve();
      }
      pause(): void {
        this.paused = true;
      }
      focus(): void {}
    }
    const video = new FakeVideo();
    let keydown:
      | ((event: {
          target: unknown;
          key: string;
          preventDefault: () => void;
          ctrlKey?: boolean;
          metaKey?: boolean;
          altKey?: boolean;
        }) => void)
      | undefined;
    const documentMock = {
      activeElement: null as unknown,
      fullscreenEnabled: false,
      querySelector: (selector: string) => (selector === "video" ? video : null),
      querySelectorAll: () => [],
      addEventListener: (name: string, listener: typeof keydown) => {
        if (name === "keydown") keydown = listener;
      },
    };
    vi.stubGlobal("Element", FakeElement);
    vi.stubGlobal("HTMLElement", FakeElement);
    vi.stubGlobal("document", documentMock);
    vi.stubGlobal("window", {
      location: { href: "https://example.com/viewer.html" },
      history: { pushState: vi.fn(), replaceState: vi.fn() },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("navigator", {});

    new Function(VIEWER_SCRIPT)();
    expect(keydown).toBeDefined();

    keydown!({ target: documentMock, key: "m", preventDefault: vi.fn() });
    expect(video.muted).toBe(false);

    documentMock.activeElement = video;
    const preventDefault = vi.fn();
    keydown!({ target: video, key: "m", preventDefault });
    expect(video.muted).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();

    const modifiedPreventDefault = vi.fn();
    const beforeTime = video.currentTime;
    keydown!({
      target: video,
      key: "ArrowLeft",
      altKey: true,
      preventDefault: modifiedPreventDefault,
    });
    expect(video.currentTime).toBe(beforeTime);
    expect(modifiedPreventDefault).not.toHaveBeenCalled();
  });
});
