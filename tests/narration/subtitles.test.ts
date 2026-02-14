import { describe, it, expect } from "vitest";
import { formatTimestamp, generateVTT, generateSRT } from "../../src/narration/subtitles.js";
import type { NarrationSegment } from "../../src/narration/types.js";

/* ------------------------------------------------------------------ */
/*  formatTimestamp                                                    */
/* ------------------------------------------------------------------ */

describe("formatTimestamp", () => {
  it("formats 0ms for VTT", () => {
    expect(formatTimestamp(0, "vtt")).toBe("00:00:00.000");
  });

  it("formats 0ms for SRT", () => {
    expect(formatTimestamp(0, "srt")).toBe("00:00:00,000");
  });

  it("formats milliseconds correctly for VTT", () => {
    expect(formatTimestamp(1500, "vtt")).toBe("00:00:01.500");
  });

  it("formats milliseconds correctly for SRT (comma separator)", () => {
    expect(formatTimestamp(1500, "srt")).toBe("00:00:01,500");
  });

  it("formats minutes and seconds", () => {
    // 2 minutes 30 seconds = 150000ms
    expect(formatTimestamp(150000, "vtt")).toBe("00:02:30.000");
  });

  it("formats hours", () => {
    // 1 hour 5 minutes 3 seconds 200ms = 3903200ms
    expect(formatTimestamp(3903200, "vtt")).toBe("01:05:03.200");
  });

  it("handles large values", () => {
    // 99 hours 59 minutes 59 seconds 999ms
    const ms = 99 * 3600000 + 59 * 60000 + 59 * 1000 + 999;
    expect(formatTimestamp(ms, "vtt")).toBe("99:59:59.999");
  });

  it("formats partial seconds", () => {
    expect(formatTimestamp(42, "vtt")).toBe("00:00:00.042");
  });
});

/* ------------------------------------------------------------------ */
/*  generateVTT                                                       */
/* ------------------------------------------------------------------ */

describe("generateVTT", () => {
  it("generates valid VTT output", () => {
    const segments: NarrationSegment[] = [
      { text: "Hello world", startMs: 0, endMs: 2000 },
      { text: "Second line", startMs: 2500, endMs: 5000 },
    ];

    const vtt = generateVTT(segments);

    expect(vtt).toContain("WEBVTT");
    expect(vtt).toContain("1\n00:00:00.000 --> 00:00:02.000\nHello world");
    expect(vtt).toContain("2\n00:00:02.500 --> 00:00:05.000\nSecond line");
  });

  it("starts with WEBVTT header", () => {
    const segments: NarrationSegment[] = [{ text: "Test", startMs: 0, endMs: 1000 }];

    const vtt = generateVTT(segments);

    expect(vtt.startsWith("WEBVTT\n")).toBe(true);
  });

  it("returns only header for empty segments", () => {
    const vtt = generateVTT([]);
    expect(vtt).toBe("WEBVTT\n");
  });

  it("uses period as millisecond separator", () => {
    const segments: NarrationSegment[] = [{ text: "Test", startMs: 1500, endMs: 3500 }];

    const vtt = generateVTT(segments);

    expect(vtt).toContain("00:00:01.500 --> 00:00:03.500");
  });
});

/* ------------------------------------------------------------------ */
/*  generateSRT                                                       */
/* ------------------------------------------------------------------ */

describe("generateSRT", () => {
  it("generates valid SRT output", () => {
    const segments: NarrationSegment[] = [
      { text: "Hello world", startMs: 0, endMs: 2000 },
      { text: "Second line", startMs: 2500, endMs: 5000 },
    ];

    const srt = generateSRT(segments);

    expect(srt).toContain("1\n00:00:00,000 --> 00:00:02,000\nHello world");
    expect(srt).toContain("2\n00:00:02,500 --> 00:00:05,000\nSecond line");
  });

  it("does not contain WEBVTT header", () => {
    const segments: NarrationSegment[] = [{ text: "Test", startMs: 0, endMs: 1000 }];

    const srt = generateSRT(segments);

    expect(srt).not.toContain("WEBVTT");
  });

  it("returns empty string for empty segments", () => {
    const srt = generateSRT([]);
    expect(srt).toBe("");
  });

  it("uses comma as millisecond separator", () => {
    const segments: NarrationSegment[] = [{ text: "Test", startMs: 1500, endMs: 3500 }];

    const srt = generateSRT(segments);

    expect(srt).toContain("00:00:01,500 --> 00:00:03,500");
  });
});
