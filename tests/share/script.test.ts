import { describe, expect, it } from "vitest";
import { VIEWER_SCRIPT } from "../../src/share/script.js";

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
});
