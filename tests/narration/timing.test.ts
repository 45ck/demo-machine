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
  it("shifts narration so the action lands mid-sentence", () => {
    const segments = makeSegments([{ startMs: 5000, durationMs: 2000 }]);
    adjustTiming(segments);
    // Narration should start at 5000 - 50% of 2000 = 4000
    expect(segments[0]!.startMs).toBe(4000);
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
    // First starts at 1000 and ends at 3000.
    // Second would start at 1500, so it is pushed after the first segment + gap.
    expect(segments[0]!.startMs).toBe(1000);
    expect(segments[1]!.startMs).toBe(3000 + GAP_MS);
  });

  it("preserves sparse action anchors instead of pulling later narration forward", () => {
    const segments = makeSegments([
      { startMs: 5000, durationMs: 1000 },
      { startMs: 20000, durationMs: 1000 },
    ]);
    adjustTiming(segments);
    // First: starts at 4500, ends at 5500.
    // Second remains anchored at 19500 so the action at 20000 still lands
    // mid-sentence even though the preceding action was much earlier.
    expect(segments[0]!.startMs).toBe(4500);
    expect(segments[1]!.startMs).toBe(19500);
    expect(segments[1]!.startMs).toBeLessThanOrEqual(20000);
    expect(segments[1]!.startMs + segments[1]!.durationMs).toBeGreaterThanOrEqual(20000);
  });

  it("keeps anchored timing when the natural gap is within tolerance", () => {
    const segments = makeSegments([
      { startMs: 5000, durationMs: 1000 },
      { startMs: 6500, durationMs: 1000 },
    ]);
    adjustTiming(segments);
    // First: starts at 4500, ends at 5500.
    // Second remains anchored to 6000.
    expect(segments[0]!.startMs).toBe(4500);
    expect(segments[1]!.startMs).toBe(6000);
  });

  it("handles empty array", () => {
    const segments: TimedSegment[] = [];
    adjustTiming(segments);
    expect(segments).toHaveLength(0);
  });

  it("handles single segment", () => {
    const segments = makeSegments([{ startMs: 3000, durationMs: 1500 }]);
    adjustTiming(segments);
    expect(segments[0]!.startMs).toBe(2250);
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
    expect(segments[0]!.startMs).toBe(0);
    expect(segments[1]!.startMs).toBe(2000 + GAP_MS);
    expect(segments[2]!.startMs).toBe(4200 + GAP_MS);
  });

  it("keeps closely-spaced narration segments from overlapping", () => {
    const segments = makeSegments([
      { startMs: 1000, durationMs: 3000 }, // action at 1000ms, shifted to 0, ends at 3000
      { startMs: 2000, durationMs: 2000 },
    ]);
    adjustTiming(segments);
    expect(segments[0]!.startMs).toBe(0);
    expect(segments[1]!.startMs).toBe(3000 + GAP_MS);
  });

  it("handles zero-duration segment", () => {
    const segments = makeSegments([{ startMs: 5000, durationMs: 0 }]);
    adjustTiming(segments);
    // max(0, 5000 - 0) = 5000
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
