import { describe, expect, it } from "vitest";
import { deriveViewerChapters, formatViewerTime } from "../../src/share/chapters.js";
import { parseVttTranscript } from "../../src/share/transcript.js";
import { demoSpecSchema } from "../../src/spec/schema.js";

describe("share viewer timeline evidence", () => {
  it("derives chapter starts from captured step events", () => {
    const spec = demoSpecSchema.parse({
      meta: { title: "Flow" },
      chapters: [
        { title: "Intake", steps: [{ action: "wait", timeout: 100 }] },
        {
          title: "Review",
          steps: [
            { action: "wait", timeout: 100 },
            { action: "wait", timeout: 100 },
          ],
        },
      ],
    });
    const chapters = deriveViewerChapters({
      spec,
      events: [
        { action: "wait", timestamp: 10_000, duration: 100 },
        { action: "wait", timestamp: 12_500, duration: 100 },
        { action: "wait", timestamp: 14_000, duration: 100 },
      ],
      startTimestamp: 10_000,
    });
    expect(chapters).toEqual([
      { title: "Intake", startMs: 0 },
      { title: "Review", startMs: 2_500 },
    ]);
    expect(formatViewerTime(62_900)).toBe("1:02");
    expect(formatViewerTime(3_662_900)).toBe("1:01:02");
  });

  it("parses WEBVTT cues into a bounded transcript", () => {
    const cues = parseVttTranscript(`WEBVTT

00:00:01.000 --> 00:00:03.500
First <b>review</b> item.

cue-2
00:01:04.000 --> 00:01:06.000 align:start
Evidence &amp; handover.
`);
    expect(cues).toEqual([
      { startMs: 1_000, endMs: 3_500, text: "First review item." },
      { startMs: 64_000, endMs: 66_000, text: "Evidence & handover." },
    ]);
  });

  it("rejects non-WEBVTT caption input", () => {
    expect(() => parseVttTranscript("not captions")).toThrow("valid WEBVTT");
  });
});
