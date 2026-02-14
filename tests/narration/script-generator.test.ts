import { describe, it, expect } from "vitest";
import { generateScript } from "../../src/narration/script-generator.js";
import type { Chapter } from "../../src/spec/types.js";
import type { ActionEvent } from "../../src/playback/types.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeChapter(
  steps: Array<{ action: string; narration?: string; [k: string]: unknown }>,
): Chapter {
  return {
    title: "Test Chapter",
    steps: steps.map((s) => ({ ...s }) as Chapter["steps"][number]),
  };
}

function makeEvent(action: string, timestamp: number, duration: number): ActionEvent {
  return { action, timestamp, duration };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe("generateScript", () => {
  it("maps narrated steps to matching event timestamps", () => {
    const chapters = [
      makeChapter([
        { action: "navigate", url: "/", narration: "Open the app" },
        { action: "click", selector: "#btn", narration: "Click button" },
      ]),
    ];
    const events = [makeEvent("navigate", 0, 1000), makeEvent("click", 1000, 500)];

    const segments = generateScript(chapters, events);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({
      text: "Open the app",
      startMs: 0,
      endMs: 1000,
    });
    expect(segments[1]).toEqual({
      text: "Click button",
      startMs: 1000,
      endMs: 1500,
    });
  });

  it("skips steps without narration", () => {
    const chapters = [
      makeChapter([
        { action: "navigate", url: "/" },
        { action: "click", selector: "#btn", narration: "Click it" },
        { action: "wait", timeout: 500 },
      ]),
    ];
    const events = [
      makeEvent("navigate", 0, 500),
      makeEvent("click", 500, 300),
      makeEvent("wait", 800, 500),
    ];

    const segments = generateScript(chapters, events);

    expect(segments).toHaveLength(1);
    expect(segments[0]!.text).toBe("Click it");
    expect(segments[0]!.startMs).toBe(500);
    expect(segments[0]!.endMs).toBe(800);
  });

  it("returns empty array when no steps have narration", () => {
    const chapters = [
      makeChapter([
        { action: "navigate", url: "/" },
        { action: "click", selector: "#btn" },
      ]),
    ];
    const events = [makeEvent("navigate", 0, 500), makeEvent("click", 500, 300)];

    const segments = generateScript(chapters, events);

    expect(segments).toHaveLength(0);
  });

  it("uses estimated timing when events are shorter than steps", () => {
    const chapters = [
      makeChapter([
        { action: "navigate", url: "/", narration: "First step" },
        { action: "click", selector: "#btn", narration: "Second step" },
        { action: "wait", timeout: 500, narration: "Third step" },
      ]),
    ];
    const events = [makeEvent("navigate", 0, 1000)];

    const segments = generateScript(chapters, events);

    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({
      text: "First step",
      startMs: 0,
      endMs: 1000,
    });
    // No matching event for index 1 -> falls back to index * 3000
    expect(segments[1]).toEqual({
      text: "Second step",
      startMs: 3000,
      endMs: 6000,
    });
    // No matching event for index 2 -> falls back to index * 3000
    expect(segments[2]).toEqual({
      text: "Third step",
      startMs: 6000,
      endMs: 9000,
    });
  });

  it("handles multiple chapters", () => {
    const chapters = [
      makeChapter([{ action: "navigate", url: "/", narration: "Go home" }]),
      makeChapter([{ action: "click", selector: "#btn", narration: "Click" }]),
    ];
    const events = [makeEvent("navigate", 0, 1000), makeEvent("click", 2000, 500)];

    const segments = generateScript(chapters, events);

    expect(segments).toHaveLength(2);
    expect(segments[0]!.text).toBe("Go home");
    expect(segments[1]!.text).toBe("Click");
    expect(segments[1]!.startMs).toBe(2000);
    expect(segments[1]!.endMs).toBe(2500);
  });

  it("handles empty chapters array", () => {
    const segments = generateScript([], []);
    expect(segments).toHaveLength(0);
  });

  it("uses relative timestamps when events have non-zero t0", () => {
    const t0 = 1700000000000; // epoch ms
    const chapters = [
      makeChapter([
        { action: "navigate", url: "/", narration: "Open the app" },
        { action: "click", selector: "#btn", narration: "Click button" },
      ]),
    ];
    const events = [makeEvent("navigate", t0, 1000), makeEvent("click", t0 + 2000, 500)];

    const segments = generateScript(chapters, events);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({
      text: "Open the app",
      startMs: 0,
      endMs: 1000,
    });
    expect(segments[1]).toEqual({
      text: "Click button",
      startMs: 2000,
      endMs: 2500,
    });
  });
});
