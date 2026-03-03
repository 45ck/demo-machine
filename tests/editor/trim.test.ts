import { describe, it, expect } from "vitest";
import {
  resolveStartStepIndex,
  trimSpecFromStepIndex,
  applyTimelineTrim,
} from "../../src/editor/trim.js";
import type { DemoSpec } from "../../src/spec/types.js";
import type { ActionEvent } from "../../src/playback/types.js";

function makeSpec(chapterDefs: { title: string; stepCount: number }[]): DemoSpec {
  return {
    meta: { title: "Test", resolution: { width: 1920, height: 1080 } },
    pacing: {
      cursorDurationMs: 600,
      typeDelayMs: 50,
      postClickDelayMs: 500,
      postTypeDelayMs: 300,
      postNavigateDelayMs: 1000,
      settleDelayMs: 200,
    },
    chapters: chapterDefs.map((def) => ({
      title: def.title,
      steps: Array.from({ length: def.stepCount }, (_, i) => ({
        action: "click" as const,
        selector: `#btn-${String(i)}`,
      })),
    })),
  };
}

function makeEvents(count: number, startTimestamp: number): ActionEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    action: "click",
    selector: `#btn-${String(i)}`,
    timestamp: startTimestamp + i * 1000,
    duration: 100,
  }));
}

describe("resolveStartStepIndex", () => {
  const spec = makeSpec([
    { title: "Login", stepCount: 3 },
    { title: "Dashboard", stepCount: 2 },
    { title: "Settings", stepCount: 4 },
  ]);

  it("returns 0 when no fromChapter and no fromStep", () => {
    const result = resolveStartStepIndex({ spec });
    expect(result).toBe(0);
  });

  it("returns fromStep when only fromStep is provided", () => {
    const result = resolveStartStepIndex({ spec, fromStep: 4 });
    expect(result).toBe(4);
  });

  it("returns correct global step index when only fromChapter is provided", () => {
    // "Dashboard" starts after Login's 3 steps
    const result = resolveStartStepIndex({ spec, fromChapter: "Dashboard" });
    expect(result).toBe(3);
  });

  it("returns correct offset when fromChapter and fromStep are both provided", () => {
    // "Settings" starts at index 5 (3 + 2), fromStep 2 → global index 7
    const result = resolveStartStepIndex({ spec, fromChapter: "Settings", fromStep: 2 });
    expect(result).toBe(7);
  });

  it("matches chapter name case-insensitively", () => {
    const result = resolveStartStepIndex({ spec, fromChapter: "dashboard" });
    expect(result).toBe(3);
  });

  it("throws when chapter is not found, listing available chapters", () => {
    expect(() => resolveStartStepIndex({ spec, fromChapter: "NonExistent" })).toThrow(
      /Chapter "NonExistent" not found/,
    );
    expect(() => resolveStartStepIndex({ spec, fromChapter: "NonExistent" })).toThrow(/Login/);
    expect(() => resolveStartStepIndex({ spec, fromChapter: "NonExistent" })).toThrow(/Dashboard/);
    expect(() => resolveStartStepIndex({ spec, fromChapter: "NonExistent" })).toThrow(/Settings/);
  });

  it("throws when fromStep is out of range for the chapter", () => {
    // Dashboard has 2 steps (indices 0 and 1), so step 2 is out of range
    expect(() => resolveStartStepIndex({ spec, fromChapter: "Dashboard", fromStep: 2 })).toThrow(
      /out of range.*Dashboard.*2 step/,
    );
  });

  it("throws when fromStep is negative", () => {
    expect(() => resolveStartStepIndex({ spec, fromStep: -1 })).toThrow(/non-negative integer/);
  });

  it("throws when fromStep is not an integer", () => {
    expect(() => resolveStartStepIndex({ spec, fromStep: 1.5 })).toThrow(/non-negative integer/);
  });
});

describe("trimSpecFromStepIndex", () => {
  const spec = makeSpec([
    { title: "Login", stepCount: 3 },
    { title: "Dashboard", stepCount: 2 },
    { title: "Settings", stepCount: 4 },
  ]);

  it("returns spec unchanged when startStepIndex is 0", () => {
    const result = trimSpecFromStepIndex(spec, 0);
    expect(result).toBe(spec);
  });

  it("returns spec unchanged when startStepIndex is negative", () => {
    const result = trimSpecFromStepIndex(spec, -1);
    expect(result).toBe(spec);
  });

  it("trims first chapter partially", () => {
    // Skip first 2 steps of Login (3 steps), keeping 1 step in Login
    const result = trimSpecFromStepIndex(spec, 2);
    expect(result.chapters).toHaveLength(3);
    expect(result.chapters[0]!.title).toBe("Login");
    expect(result.chapters[0]!.steps).toHaveLength(1);
    expect(result.chapters[1]!.title).toBe("Dashboard");
    expect(result.chapters[1]!.steps).toHaveLength(2);
    expect(result.chapters[2]!.title).toBe("Settings");
    expect(result.chapters[2]!.steps).toHaveLength(4);
  });

  it("trims entire first chapter and keeps the rest", () => {
    // Skip all 3 steps of Login → starts at Dashboard
    const result = trimSpecFromStepIndex(spec, 3);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0]!.title).toBe("Dashboard");
    expect(result.chapters[0]!.steps).toHaveLength(2);
    expect(result.chapters[1]!.title).toBe("Settings");
    expect(result.chapters[1]!.steps).toHaveLength(4);
  });

  it("trims multiple chapters", () => {
    // Skip Login (3) + Dashboard (2) = 5, starts at Settings
    const result = trimSpecFromStepIndex(spec, 5);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0]!.title).toBe("Settings");
    expect(result.chapters[0]!.steps).toHaveLength(4);
  });

  it("trims into the middle of a non-first chapter", () => {
    // Skip Login (3) + 1 from Dashboard = 4
    const result = trimSpecFromStepIndex(spec, 4);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0]!.title).toBe("Dashboard");
    expect(result.chapters[0]!.steps).toHaveLength(1);
    expect(result.chapters[1]!.title).toBe("Settings");
    expect(result.chapters[1]!.steps).toHaveLength(4);
  });

  it("throws when startStepIndex exceeds available steps", () => {
    // Total steps: 3 + 2 + 4 = 9
    expect(() => trimSpecFromStepIndex(spec, 9)).toThrow(/exceeds available steps/);
    expect(() => trimSpecFromStepIndex(spec, 10)).toThrow(/exceeds available steps/);
  });

  it("handles a single-chapter spec correctly", () => {
    const singleChapterSpec = makeSpec([{ title: "Only", stepCount: 5 }]);
    const result = trimSpecFromStepIndex(singleChapterSpec, 3);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0]!.title).toBe("Only");
    expect(result.chapters[0]!.steps).toHaveLength(2);
  });

  it("preserves spec-level fields (runner, pacing, preSteps)", () => {
    const specWithExtras: DemoSpec = {
      ...makeSpec([
        { title: "A", stepCount: 3 },
        { title: "B", stepCount: 2 },
      ]),
      runner: { url: "http://localhost:3000", timeout: 30000 },
      preSteps: [
        { action: "httpRequest", method: "GET", url: "/api/health" },
      ] as DemoSpec["preSteps"],
    };
    const result = trimSpecFromStepIndex(specWithExtras, 1);
    expect(result.runner).toEqual(specWithExtras.runner);
    expect(result.pacing).toEqual(specWithExtras.pacing);
    expect(result.preSteps).toEqual(specWithExtras.preSteps);
  });
});

describe("applyTimelineTrim", () => {
  const spec = makeSpec([
    { title: "Login", stepCount: 3 },
    { title: "Dashboard", stepCount: 2 },
  ]);
  const startTimestamp = 10000;

  it("returns identity for empty events", () => {
    const result = applyTimelineTrim({
      events: [],
      spec,
      startTimestamp,
    });
    expect(result.events).toEqual([]);
    expect(result.timelineStartTimestamp).toBe(startTimestamp);
    expect(result.videoTrimStartMs).toBe(0);
    expect(result.startEventIndex).toBe(0);
  });

  it("returns identity when no trim flags are set", () => {
    const events = makeEvents(5, startTimestamp);
    const result = applyTimelineTrim({
      events,
      spec,
      startTimestamp,
    });
    expect(result.events).toHaveLength(5);
    expect(result.timelineStartTimestamp).toBe(startTimestamp);
    expect(result.videoTrimStartMs).toBe(0);
    expect(result.startEventIndex).toBe(0);
  });

  it("trims events when fromChapter is set and advances timelineStartTimestamp", () => {
    const events = makeEvents(5, startTimestamp);
    // Dashboard starts at step index 3 (after Login's 3 steps)
    const result = applyTimelineTrim({
      events,
      spec,
      startTimestamp,
      fromChapter: "Dashboard",
    });
    // Event at index 3 has timestamp startTimestamp + 3000
    expect(result.startEventIndex).toBe(3);
    expect(result.events).toHaveLength(2);
    expect(result.timelineStartTimestamp).toBe(startTimestamp + 3000);
    expect(result.videoTrimStartMs).toBe(3000);
  });

  it("shifts by trimStartMs on top of fromChapter trim", () => {
    const events = makeEvents(5, startTimestamp);
    // Dashboard starts at step index 3 (timestamp = startTimestamp + 3000)
    // trimStartMs adds 500 more → trim at startTimestamp + 3500
    // Event at index 4 (timestamp startTimestamp + 4000) is first >= trimStartTimestamp
    const result = applyTimelineTrim({
      events,
      spec,
      startTimestamp,
      fromChapter: "Dashboard",
      trimStartMs: 500,
    });
    expect(result.startEventIndex).toBe(4);
    expect(result.events).toHaveLength(1);
    expect(result.timelineStartTimestamp).toBe(startTimestamp + 3500);
    expect(result.videoTrimStartMs).toBe(3500);
  });

  it("applies trimStartMs alone without fromChapter", () => {
    const events = makeEvents(5, startTimestamp);
    // trimStartMs = 1500 → trim at startTimestamp + 1500
    // Event at index 2 (timestamp startTimestamp + 2000) is first >= trimStartTimestamp
    const result = applyTimelineTrim({
      events,
      spec,
      startTimestamp,
      trimStartMs: 1500,
    });
    expect(result.startEventIndex).toBe(2);
    expect(result.events).toHaveLength(3);
    expect(result.timelineStartTimestamp).toBe(startTimestamp + 1500);
    expect(result.videoTrimStartMs).toBe(1500);
  });

  it("trims events when fromStep is set", () => {
    const events = makeEvents(5, startTimestamp);
    const result = applyTimelineTrim({
      events,
      spec,
      startTimestamp,
      fromStep: 2,
    });
    // Step 2 has timestamp startTimestamp + 2000
    expect(result.startEventIndex).toBe(2);
    expect(result.events).toHaveLength(3);
    expect(result.timelineStartTimestamp).toBe(startTimestamp + 2000);
    expect(result.videoTrimStartMs).toBe(2000);
  });

  it("throws when all events are trimmed away", () => {
    const events = makeEvents(5, startTimestamp);
    // Events span startTimestamp..startTimestamp+4000
    // trimStartMs of 50000 should remove all events
    expect(() =>
      applyTimelineTrim({
        events,
        spec,
        startTimestamp,
        trimStartMs: 50000,
      }),
    ).toThrow(/removes all events/);
  });

  it("throws when requested step index exceeds spec step count", () => {
    const events = makeEvents(5, startTimestamp);
    // Spec has 5 steps total (Login:3 + Dashboard:2). fromStep 5 exceeds the spec step count.
    expect(() =>
      applyTimelineTrim({
        events,
        spec,
        startTimestamp,
        fromStep: 5,
      }),
    ).toThrow(/exceeds spec step count/);
  });

  it("applies combined fromStep, fromChapter, and trimStartMs", () => {
    const threeChapterSpec = makeSpec([
      { title: "Login", stepCount: 3 },
      { title: "Dashboard", stepCount: 2 },
      { title: "Settings", stepCount: 4 },
    ]);
    const events = makeEvents(9, startTimestamp);
    // fromChapter="Dashboard" starts at step 3, fromStep=1 offsets to step 4
    // event at index 4 has timestamp startTimestamp + 4000
    // trimStartMs=500 adds 500 more → total trim = 4500ms
    // event at index 5 (timestamp startTimestamp + 5000) is first >= trimStartTimestamp
    const result = applyTimelineTrim({
      events,
      spec: threeChapterSpec,
      startTimestamp,
      fromChapter: "Dashboard",
      fromStep: 1,
      trimStartMs: 500,
    });
    expect(result.videoTrimStartMs).toBe(4500);
    expect(result.startEventIndex).toBe(5);
    expect(result.events).toHaveLength(4);
    expect(result.timelineStartTimestamp).toBe(startTimestamp + 4500);
  });

  it("returns trimmed spec alongside trimmed events", () => {
    const events = makeEvents(5, startTimestamp);
    const result = applyTimelineTrim({
      events,
      spec,
      startTimestamp,
      fromChapter: "Dashboard",
    });
    // The spec should be trimmed: only Dashboard chapter remains
    expect(result.spec.chapters).toHaveLength(1);
    expect(result.spec.chapters[0]!.title).toBe("Dashboard");
  });
});
