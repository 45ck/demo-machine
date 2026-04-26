import { describe, expect, it } from "vitest";
import {
  collectRenderedVideoSampleTimes,
  extractRenderedVideoSamples,
} from "../../src/quality/video-sampler.js";

describe("rendered video sampler", () => {
  it("collects start, interval, end, and event-boundary samples with stable dedupe", () => {
    const times = collectRenderedVideoSampleTimes({
      videoDurationMs: 5_000,
      events: [
        { timestamp: 0, duration: 250 },
        { timestamp: 2_000, duration: 500 },
        { timestamp: 4_990, duration: 500 },
      ],
      options: { intervalMs: 2_000, startSampleOffsetMs: 250 },
    });

    expect(times).toEqual([0, 250, 2_000, 2_500, 4_000, 4_950]);
  });

  it("caps samples after sorting and deduping", () => {
    const times = collectRenderedVideoSampleTimes({
      videoDurationMs: 10_000,
      events: [{ timestamp: 500, duration: 500 }],
      options: { intervalMs: 1_000, maxSamples: 4 },
    });

    expect(times).toEqual([250, 500, 1_000, 2_000]);
  });

  it("returns extraction metadata without invoking ffmpeg when duration is unavailable", async () => {
    const result = await extractRenderedVideoSamples({
      outputMp4Path: "/missing/output.mp4",
    });

    expect(result.samples).toEqual([]);
    expect(result.extraction.requestedSampleCount).toBe(0);
    expect(result.extraction.extractedSampleCount).toBe(0);
    expect(result.extraction.status).toBe("success");
  });
});
