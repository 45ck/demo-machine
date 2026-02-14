import { describe, it, expect } from "vitest";
import { buildTimeline } from "../../src/editor/timeline.js";
import type { ActionEvent } from "../../src/playback/types.js";
import type { DemoSpec } from "../../src/spec/types.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeSpec(overrides?: Partial<DemoSpec>): DemoSpec {
  return {
    meta: {
      title: "Test Demo",
      resolution: { width: 1920, height: 1080 },
    },
    runner: { url: "http://localhost:3000", timeout: 30000 },
    chapters: [
      {
        title: "Chapter One",
        steps: [
          { action: "navigate" as const, url: "/" },
          { action: "click" as const, selector: "#btn" },
        ],
      },
    ],
    ...overrides,
  } as DemoSpec;
}

function makeEvents(count: number, gap = 500): ActionEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    action: i === 1 ? "click" : "navigate",
    timestamp: 1000 + i * (1000 + gap),
    duration: 1000,
    selector: i === 1 ? "#btn" : undefined,
    boundingBox: i === 1 ? { x: 100, y: 200, width: 50, height: 30 } : undefined,
  }));
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe("buildTimeline", () => {
  it("returns empty segments for empty events", () => {
    const timeline = buildTimeline([], makeSpec());
    expect(timeline.segments).toHaveLength(0);
    expect(timeline.totalDurationMs).toBe(0);
  });

  it("creates intro and outro segments", () => {
    const events = makeEvents(2);
    const timeline = buildTimeline(events, makeSpec());
    const types = timeline.segments.map((s) => s.type);
    expect(types).toContain("intro");
    expect(types).toContain("outro");
  });

  it("intro segment uses spec title as label", () => {
    const events = makeEvents(2);
    const timeline = buildTimeline(events, makeSpec());
    const intro = timeline.segments.find((s) => s.type === "intro");
    expect(intro?.label).toBe("Test Demo");
  });

  it("intro segment is 2000ms starting at 0", () => {
    const events = makeEvents(2);
    const timeline = buildTimeline(events, makeSpec());
    const intro = timeline.segments.find((s) => s.type === "intro");
    expect(intro).toBeDefined();
    expect(intro!.startMs).toBe(0);
    expect(intro!.endMs - intro!.startMs).toBe(2000);
  });

  it("outro segment is at the end of the video", () => {
    const events = makeEvents(2);
    const timeline = buildTimeline(events, makeSpec());
    const outro = timeline.segments.find((s) => s.type === "outro");
    expect(outro).toBeDefined();
    expect(outro!.endMs).toBe(timeline.totalDurationMs);
  });

  it("creates chapter title segments", () => {
    const spec = makeSpec();
    const events = makeEvents(2);
    const timeline = buildTimeline(events, spec);
    const chapters = timeline.segments.filter((s) => s.type === "chapter");
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.label).toBe("Chapter One");
  });

  it("chapter title segments are 1500ms", () => {
    const timeline = buildTimeline(makeEvents(2), makeSpec());
    const chapter = timeline.segments.find((s) => s.type === "chapter");
    expect(chapter).toBeDefined();
    expect(chapter!.endMs - chapter!.startMs).toBe(1500);
  });

  it("creates content segments for events", () => {
    const events = makeEvents(2);
    const timeline = buildTimeline(events, makeSpec());
    const contentSegments = timeline.segments.filter((s) => s.type === "content");
    expect(contentSegments).toHaveLength(2);
  });

  it("creates callout segments for click events with boundingBox", () => {
    const events = makeEvents(2);
    const timeline = buildTimeline(events, makeSpec());
    const callouts = timeline.segments.filter((s) => s.type === "callout");
    expect(callouts).toHaveLength(1);
    expect(callouts[0]!.zoom).toBeDefined();
    expect(callouts[0]!.zoom!.x).toBe(100);
    expect(callouts[0]!.zoom!.padding).toBe(40);
  });

  it("callout segments have 1500ms duration", () => {
    const events = makeEvents(2);
    const timeline = buildTimeline(events, makeSpec());
    const callouts = timeline.segments.filter((s) => s.type === "callout");
    expect(callouts).toHaveLength(1);
    expect(callouts[0]!.endMs - callouts[0]!.startMs).toBe(1500);
  });

  it("applies dead-time compression when gap > 3000ms", () => {
    const events: ActionEvent[] = [
      { action: "navigate", timestamp: 1000, duration: 500 },
      { action: "click", timestamp: 6000, duration: 500, selector: "#btn" },
    ];
    const spec = makeSpec();
    const timeline = buildTimeline(events, spec);
    const compressed = timeline.segments.filter((s) => s.type === "content" && s.speedFactor === 3);
    expect(compressed).toHaveLength(1);
  });

  it("does not apply dead-time compression when gap <= 3000ms", () => {
    const events: ActionEvent[] = [
      { action: "navigate", timestamp: 1000, duration: 500 },
      { action: "click", timestamp: 2000, duration: 500, selector: "#btn" },
    ];
    const spec = makeSpec();
    const timeline = buildTimeline(events, spec);
    const compressed = timeline.segments.filter(
      (s) => s.type === "content" && s.speedFactor !== undefined,
    );
    expect(compressed).toHaveLength(0);
  });

  it("totalDurationMs matches event span", () => {
    const events = makeEvents(2);
    const first = events[0]!;
    const last = events[events.length - 1]!;
    const expectedDuration = last.timestamp + last.duration - first.timestamp;
    const timeline = buildTimeline(events, makeSpec());
    expect(timeline.totalDurationMs).toBe(expectedDuration);
  });

  it("uses spec resolution", () => {
    const spec = makeSpec({
      meta: {
        title: "T",
        resolution: { width: 2560, height: 1440 },
      },
    } as Partial<DemoSpec>);
    const timeline = buildTimeline([], spec);
    expect(timeline.resolution).toEqual({ width: 2560, height: 1440 });
  });

  it("handles multiple chapters", () => {
    const spec = makeSpec({
      chapters: [
        { title: "Ch1", steps: [{ action: "navigate" as const, url: "/" }] },
        { title: "Ch2", steps: [{ action: "click" as const, selector: "#a" }] },
      ],
    } as Partial<DemoSpec>);
    const events = makeEvents(2);
    const timeline = buildTimeline(events, spec);
    const chapters = timeline.segments.filter((s) => s.type === "chapter");
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.label).toBe("Ch1");
    expect(chapters[1]!.label).toBe("Ch2");
  });

  it("content segments use video-relative timestamps", () => {
    const events: ActionEvent[] = [
      { action: "navigate", timestamp: 5000, duration: 200 },
      { action: "click", timestamp: 5500, duration: 300, selector: "#btn" },
    ];
    const timeline = buildTimeline(events, makeSpec());
    const contentSegments = timeline.segments.filter((s) => s.type === "content");
    expect(contentSegments[0]!.startMs).toBe(0);
    expect(contentSegments[1]!.startMs).toBe(500);
  });
});
