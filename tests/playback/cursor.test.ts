import { describe, it, expect } from "vitest";
import {
  cubicBezier,
  getCursorCSS,
  getMoveCursorScript,
  getClickPulseScript,
} from "../../src/playback/cursor.js";

describe("cubicBezier", () => {
  it("returns 0 at t=0", () => {
    expect(cubicBezier(0)).toBe(0);
  });

  it("returns 1 at t=1", () => {
    expect(cubicBezier(1)).toBe(1);
  });

  it("returns a value between 0 and 1 for t=0.5", () => {
    const result = cubicBezier(0.5);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });

  it("produces smooth ease-in-out curve (midpoint near 0.5)", () => {
    const mid = cubicBezier(0.5);
    expect(mid).toBeCloseTo(0.5, 1);
  });

  it("is monotonically increasing", () => {
    let prev = 0;
    for (let i = 1; i <= 10; i++) {
      const val = cubicBezier(i / 10);
      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }
  });
});

describe("getCursorCSS", () => {
  it("contains #dm-cursor selector", () => {
    const css = getCursorCSS();
    expect(css).toContain("#dm-cursor");
  });

  it("sets position fixed", () => {
    const css = getCursorCSS();
    expect(css).toContain("position: fixed");
  });

  it("sets high z-index", () => {
    const css = getCursorCSS();
    expect(css).toMatch(/z-index:\s*999999/);
  });

  it("disables pointer events", () => {
    const css = getCursorCSS();
    expect(css).toContain("pointer-events: none");
  });

  it("uses SVG background image", () => {
    const css = getCursorCSS();
    expect(css).toContain("background-image: url(");
    expect(css).toContain("data:image/svg+xml");
  });

  it("has drop shadow filter", () => {
    const css = getCursorCSS();
    expect(css).toContain("drop-shadow");
  });

  it("sets width and height to 24px", () => {
    const css = getCursorCSS();
    expect(css).toContain("width: 24px");
    expect(css).toContain("height: 24px");
  });
});

describe("getMoveCursorScript", () => {
  it("returns a string containing the coordinates", () => {
    const script = getMoveCursorScript({
      fromX: 10,
      fromY: 20,
      toX: 300,
      toY: 400,
      durationMs: 500,
    });
    expect(script).toContain("10");
    expect(script).toContain("20");
    expect(script).toContain("300");
    expect(script).toContain("400");
    expect(script).toContain("500");
  });

  it("references dm-cursor element", () => {
    const script = getMoveCursorScript({ fromX: 0, fromY: 0, toX: 100, toY: 100, durationMs: 300 });
    expect(script).toContain("dm-cursor");
  });

  it("includes requestAnimationFrame for animation", () => {
    const script = getMoveCursorScript({ fromX: 0, fromY: 0, toX: 100, toY: 100, durationMs: 300 });
    expect(script).toContain("requestAnimationFrame");
  });

  it("includes easing function", () => {
    const script = getMoveCursorScript({ fromX: 0, fromY: 0, toX: 100, toY: 100, durationMs: 300 });
    expect(script).toContain("ease");
  });
});

describe("getClickPulseScript", () => {
  it("references dm-cursor element", () => {
    const script = getClickPulseScript();
    expect(script).toContain("dm-cursor");
  });

  it("applies scale transform for tactile feedback", () => {
    const script = getClickPulseScript();
    expect(script).toContain("scale(0.7)");
  });

  it("restores scale after pulse", () => {
    const script = getClickPulseScript();
    expect(script).toContain("scale(1)");
  });

  it("uses setTimeout for animation timing", () => {
    const script = getClickPulseScript();
    expect(script).toContain("setTimeout");
  });
});
