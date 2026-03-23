import { describe, it, expect } from "vitest";
import {
  detectOverlaps,
  formatTimeSeconds,
  renderTimelineView,
  buildTimelineViewInput,
  NarrationOverlapError,
  type TimelineViewInput,
} from "../../src/narration/timeline-view.js";

function makeSeg(startMs: number, endMs: number, text?: string) {
  return { startMs, endMs, text };
}

function makeEvent(timestamp: number, action = "click") {
  return { timestamp, action };
}

describe("detectOverlaps", () => {
  it("returns empty array for empty input", () => {
    expect(detectOverlaps([])).toEqual([]);
  });

  it("returns empty array for single segment", () => {
    expect(detectOverlaps([makeSeg(0, 1000)])).toEqual([]);
  });

  it("returns empty array when segments do not overlap", () => {
    const segments = [makeSeg(0, 1000), makeSeg(1000, 2000), makeSeg(3000, 4000)];
    expect(detectOverlaps(segments)).toEqual([]);
  });

  it("detects a single overlap between two segments", () => {
    const segments = [makeSeg(0, 1500), makeSeg(1000, 2500)];
    const overlaps = detectOverlaps(segments);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).toEqual({ indexA: 0, indexB: 1, overlapMs: 500 });
  });

  it("detects cascading overlaps across multiple segments", () => {
    const segments = [makeSeg(0, 2000), makeSeg(1000, 3000), makeSeg(2500, 4000)];
    const overlaps = detectOverlaps(segments);
    expect(overlaps).toHaveLength(2);
    expect(overlaps[0]!.overlapMs).toBe(1000);
    expect(overlaps[1]!.overlapMs).toBe(500);
  });

  it("handles unsorted input by sorting internally", () => {
    const segments = [makeSeg(1000, 2500), makeSeg(0, 1500)];
    const overlaps = detectOverlaps(segments);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.overlapMs).toBe(500);
  });

  it("returns empty for adjacent but non-overlapping segments", () => {
    const segments = [makeSeg(0, 1000), makeSeg(1000, 2000)];
    expect(detectOverlaps(segments)).toEqual([]);
  });
});

describe("formatTimeSeconds", () => {
  it("formats sub-minute values as seconds with one decimal", () => {
    expect(formatTimeSeconds(5000)).toBe("5.0s");
  });

  it("formats fractional seconds", () => {
    expect(formatTimeSeconds(45200)).toBe("45.2s");
  });

  it("formats minutes and seconds", () => {
    expect(formatTimeSeconds(83000)).toMatch(/1m\s+23s/);
  });

  it("formats zero", () => {
    expect(formatTimeSeconds(0)).toBe("0.0s");
  });

  it("formats small values", () => {
    expect(formatTimeSeconds(500)).toBe("0.5s");
  });

  it("formats exact minutes", () => {
    expect(formatTimeSeconds(120000)).toMatch(/2m\s+0s/);
  });
});

describe("renderTimelineView", () => {
  it("renders a basic timeline with events and narration", () => {
    const input: TimelineViewInput = {
      events: [makeEvent(0), makeEvent(5000)],
      narrationSegments: [makeSeg(0, 2000, "First step"), makeSeg(5000, 7000, "Second step")],
      totalDurationMs: 10000,
    };
    const result = renderTimelineView(input, { width: 80, color: false });
    expect(result.output).toContain("Acts");
    expect(result.output).toContain("Narr");
    expect(result.overlaps).toHaveLength(0);
  });

  it("renders chapter track when chapters are provided", () => {
    const input: TimelineViewInput = {
      events: [makeEvent(0), makeEvent(5000)],
      narrationSegments: [makeSeg(0, 2000)],
      chapters: [{ title: "Intro", startMs: 0, endMs: 5000 }],
      totalDurationMs: 10000,
    };
    const result = renderTimelineView(input, { width: 80, color: false });
    expect(result.output).toContain("Chap");
  });

  it("omits chapter track when no chapters given", () => {
    const input: TimelineViewInput = {
      events: [makeEvent(0)],
      narrationSegments: [makeSeg(0, 1000)],
      totalDurationMs: 5000,
    };
    const result = renderTimelineView(input, { width: 80, color: false });
    expect(result.output).not.toContain("Chap");
  });

  it("includes overlap warnings when segments overlap", () => {
    const input: TimelineViewInput = {
      events: [makeEvent(0), makeEvent(500)],
      narrationSegments: [makeSeg(0, 2000, "alpha"), makeSeg(1000, 3000, "beta")],
      totalDurationMs: 5000,
    };
    const result = renderTimelineView(input, { width: 80, color: false });
    expect(result.overlaps).toHaveLength(1);
    expect(result.output).toContain("Overlap");
  });

  it("respects custom width", () => {
    const input: TimelineViewInput = {
      events: [makeEvent(0)],
      narrationSegments: [makeSeg(0, 1000)],
      totalDurationMs: 5000,
    };
    const result60 = renderTimelineView(input, { width: 60, color: false });
    const result120 = renderTimelineView(input, { width: 120, color: false });
    const lines60 = result60.output.split("\n");
    const lines120 = result120.output.split("\n");
    // Wider renders should produce longer lines on average
    const avgLen = (lines: string[]) => lines.reduce((s, l) => s + l.length, 0) / lines.length;
    expect(avgLen(lines120)).toBeGreaterThan(avgLen(lines60));
  });

  it("renders single segment correctly", () => {
    const input: TimelineViewInput = {
      events: [makeEvent(1000)],
      narrationSegments: [makeSeg(500, 2000, "Only segment")],
      totalDurationMs: 5000,
    };
    const result = renderTimelineView(input, { width: 80, color: false });
    expect(result.output).toContain("Narr");
    expect(result.overlaps).toEqual([]);
  });

  it("shows overlap count in footer when overlaps exist", () => {
    const input: TimelineViewInput = {
      events: [makeEvent(0)],
      narrationSegments: [makeSeg(0, 2000), makeSeg(1000, 3000)],
      totalDurationMs: 5000,
    };
    const result = renderTimelineView(input, { width: 80, color: false });
    expect(result.output).toContain("1 overlap");
    expect(result.output).toContain("must not overlap");
  });
});

describe("buildTimelineViewInput", () => {
  it("builds input from events and segments", () => {
    const events = [makeEvent(0), makeEvent(5000)];
    const segments = [makeSeg(0, 1500), makeSeg(2000, 3500)];
    const input = buildTimelineViewInput(events, segments);
    expect(input.events).toBe(events);
    expect(input.narrationSegments).toBe(segments);
    expect(input.totalDurationMs).toBe(5000);
  });

  it("uses provided totalMs when given", () => {
    const events = [makeEvent(1000)];
    const segments = [makeSeg(0, 500)];
    const input = buildTimelineViewInput(events, segments, undefined, 10000);
    expect(input.totalDurationMs).toBe(10000);
  });

  it("handles empty events and segments", () => {
    const input = buildTimelineViewInput([], []);
    expect(input.totalDurationMs).toBe(1); // at least 1 to avoid div by zero
    expect(input.events).toEqual([]);
  });

  it("derives duration from max of event timestamps and segment ends", () => {
    const events = [makeEvent(3000)];
    const segments = [makeSeg(0, 8000)];
    const input = buildTimelineViewInput(events, segments);
    expect(input.totalDurationMs).toBe(8000);
  });
});

describe("NarrationOverlapError", () => {
  it("includes overlaps in error", () => {
    const overlaps = [{ indexA: 0, indexB: 1, overlapMs: 500 }];
    const error = new NarrationOverlapError(overlaps, "1 narration overlap detected");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("NarrationOverlapError");
    expect(error.overlaps).toEqual(overlaps);
    expect(error.message).toBe("1 narration overlap detected");
  });

  it("formats message correctly for multiple overlaps", () => {
    const overlaps = [
      { indexA: 0, indexB: 1, overlapMs: 500 },
      { indexA: 1, indexB: 2, overlapMs: 300 },
    ];
    const error = new NarrationOverlapError(overlaps, "2 narration overlaps detected");
    expect(error.overlaps).toHaveLength(2);
    expect(error.message).toContain("2 narration overlaps detected");
  });
});
