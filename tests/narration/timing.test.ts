import { describe, it, expect } from "vitest";
import { adjustTiming, computeNarrationDuration, GAP_MS } from "../../src/narration/timing.js";
import type { TimedSegment } from "../../src/narration/timing.js";

function makeSegments(entries: Array<{ startMs: number; durationMs: number }>): TimedSegment[] {
  return entries.map((e, i) => ({
    path: `/tmp/seg-${i}.audio`,
    startMs: e.startMs,
    durationMs: e.durationMs,
  }));
}

describe("adjustTiming", () => {
  it("shifts narration to lead into the action", () => {
    const segments = makeSegments([{ startMs: 5000, durationMs: 2000 }]);
    adjustTiming(segments);
    // Narration should start at 5000 - 2000 = 3000
    expect(segments[0]!.startMs).toBe(3000);
  });

  it("clamps startMs to 0 when narration is longer than action time", () => {
    const segments = makeSegments([{ startMs: 1000, durationMs: 3000 }]);
    adjustTiming(segments);
    expect(segments[0]!.startMs).toBe(0);
  });

  it("prevents overlap between segments", () => {
    const segments = makeSegments([
      { startMs: 2000, durationMs: 2000 },
      { startMs: 2500, durationMs: 2000 },
    ]);
    adjustTiming(segments);
    // First: starts at max(0, 2000-2000) = 0, ends at 0+2000 = 2000
    // Second needs to start after 2000 + GAP_MS
    expect(segments[0]!.startMs).toBe(0);
    expect(segments[1]!.startMs).toBe(2000 + GAP_MS);
  });

  it("does not push forward when there is no overlap", () => {
    const segments = makeSegments([
      { startMs: 5000, durationMs: 1000 },
      { startMs: 10000, durationMs: 1000 },
    ]);
    adjustTiming(segments);
    // First: starts at 4000, ends at 5000
    // Second: starts at 9000 (no overlap with 5200)
    expect(segments[0]!.startMs).toBe(4000);
    expect(segments[1]!.startMs).toBe(9000);
  });

  it("handles empty array", () => {
    const segments: TimedSegment[] = [];
    adjustTiming(segments);
    expect(segments).toHaveLength(0);
  });

  it("handles single segment", () => {
    const segments = makeSegments([{ startMs: 3000, durationMs: 1500 }]);
    adjustTiming(segments);
    expect(segments[0]!.startMs).toBe(1500);
  });

  it("does not mutate durationMs after adjustTiming", () => {
    const segments = makeSegments([
      { startMs: 5000, durationMs: 2000 },
      { startMs: 8000, durationMs: 3000 },
    ]);
    adjustTiming(segments);
    expect(segments[0]!.durationMs).toBe(2000);
    expect(segments[1]!.durationMs).toBe(3000);
  });

  it("handles cascading overlaps with 3+ segments", () => {
    const segments = makeSegments([
      { startMs: 1000, durationMs: 2000 },
      { startMs: 1500, durationMs: 2000 },
      { startMs: 2000, durationMs: 2000 },
    ]);
    adjustTiming(segments);
    // First: max(0, 1000-2000) = 0, ends at 2000
    expect(segments[0]!.startMs).toBe(0);
    // Second: must start after 2000 + GAP_MS = 2200
    expect(segments[1]!.startMs).toBe(2000 + GAP_MS);
    // Third: must start after 2200 + 2000 + GAP_MS = 4400
    expect(segments[2]!.startMs).toBe(2000 + GAP_MS + 2000 + GAP_MS);
  });

  it("handles zero-duration segment", () => {
    const segments = makeSegments([{ startMs: 5000, durationMs: 0 }]);
    adjustTiming(segments);
    // max(0, 5000-0) = 5000
    expect(segments[0]!.startMs).toBe(5000);
    expect(segments[0]!.durationMs).toBe(0);
  });
});

describe("computeNarrationDuration", () => {
  it("returns 0 for empty array", () => {
    expect(computeNarrationDuration([])).toBe(0);
  });

  it("returns start + duration of last segment", () => {
    const segments = makeSegments([
      { startMs: 0, durationMs: 2000 },
      { startMs: 3000, durationMs: 1500 },
    ]);
    expect(computeNarrationDuration(segments)).toBe(4500);
  });

  it("handles single segment", () => {
    const segments = makeSegments([{ startMs: 1000, durationMs: 2000 }]);
    expect(computeNarrationDuration(segments)).toBe(3000);
  });
});
