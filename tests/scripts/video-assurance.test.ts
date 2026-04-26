import { describe, expect, it } from "vitest";
import {
  UsageError,
  collectSamples,
  comparePngs,
  exitCodeForStatus,
  isBlankFrame,
  parseArgs,
  shouldCompareForMotion,
  shouldFlagLargeJump,
  validateOptions,
} from "../../scripts/video-assurance.mjs";

function frame(overrides = {}) {
  return {
    timeSec: 1,
    reasons: ["interval"],
    path: "frame.png",
    ...overrides,
  };
}

function png(width: number, height: number, rgb: [number, number, number]) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return { width, height, data };
}

describe("video assurance CLI options", () => {
  it("parses explicit values, inline values, and boolean flags", () => {
    const opts = parseArgs([
      "--output-dir=output/custom",
      "--filter",
      "todo",
      "--interval-sec",
      "1",
      "--freeze-min-span-sec=3",
      "--keep-existing",
    ]);

    expect(opts).toMatchObject({
      outputDir: "output/custom",
      filter: "todo",
      intervalSec: 1,
      freezeMinSpanSec: 3,
      keepExisting: true,
    });
  });

  it("rejects unknown, incomplete, and out-of-range options", () => {
    expect(() => parseArgs(["--unknown"])).toThrow(UsageError);
    expect(() => parseArgs(["--output-dir"])).toThrow(/Missing value/);
    expect(() => parseArgs(["--help=true"])).toThrow(/does not accept/);
    expect(() => validateOptions({ ...parseArgs([]), largeChangePercent: 101 })).toThrow(
      /between 0 and 100/,
    );
    expect(() => validateOptions({ ...parseArgs([]), blankStddev: 256 })).toThrow(
      /between 0 and 255/,
    );
  });
});

describe("video assurance sample collection", () => {
  it("samples starts, intervals, endings, and step boundaries with stable dedupe", () => {
    const samples = collectSamples(
      [
        { action: "click", timestamp: 1000, duration: 500 },
        { action: "type", timestamp: 3000, duration: 500 },
      ],
      { startTimestamp: 1000 },
      5,
      2,
      0.25,
    );

    expect(samples.map((sample) => sample.timeSec)).toEqual([0, 0.25, 0.5, 2, 2.5, 4, 4.95]);
    expect(samples[0]!.reasons).toEqual(["initial-frame", "step-start"]);
    expect(samples[3]!.reasons).toEqual(["interval", "step-start"]);
    expect(new Set(samples.map((sample) => sample.timeSec)).size).toBe(samples.length);
  });

  it("keeps event boundary samples before the exact video EOF", () => {
    const samples = collectSamples(
      [{ action: "screenshot", timestamp: 1000, duration: 4000 }],
      { startTimestamp: 1000 },
      4,
      2,
      0.25,
    );

    expect(samples.at(-1)!.timeSec).toBe(3.95);
    expect(samples.every((sample) => sample.timeSec < 4)).toBe(true);
  });
});

describe("video assurance frame analysis helpers", () => {
  it("classifies only transparent or near-black/near-white low-variance frames as blank", () => {
    expect(isBlankFrame({ transparentPercent: 100, stddevLuma: 50, meanLuma: 120 }, 4)).toBe(true);
    expect(isBlankFrame({ transparentPercent: 0, stddevLuma: 1, meanLuma: 2 }, 4)).toBe(true);
    expect(isBlankFrame({ transparentPercent: 0, stddevLuma: 1, meanLuma: 252 }, 4)).toBe(true);
    expect(isBlankFrame({ transparentPercent: 0, stddevLuma: 1, meanLuma: 120 }, 4)).toBe(false);
    expect(isBlankFrame({ transparentPercent: 0, stddevLuma: 5, meanLuma: 2 }, 4)).toBe(false);
  });

  it("compares equal, changed, and dimension-mismatched frames", () => {
    expect(comparePngs(png(2, 2, [0, 0, 0]), png(2, 2, [0, 0, 0]))).toMatchObject({
      diffPercent: 0,
      dimensionMismatch: false,
    });
    expect(comparePngs(png(2, 2, [0, 0, 0]), png(2, 2, [255, 255, 255]))).toMatchObject({
      diffPercent: 100,
      avgChannelDelta: 255,
      dimensionMismatch: false,
    });
    expect(comparePngs(png(2, 2, [0, 0, 0]), png(1, 2, [0, 0, 0]))).toMatchObject({
      diffPercent: 100,
      dimensionMismatch: true,
    });
  });

  it("suppresses motion and jump checks for initial render and step boundary frames", () => {
    const intervalFrame = frame();
    const initialFrame = frame({ timeSec: 0, reasons: ["initial-frame"] });
    const stepFrame = frame({ reasons: ["step-end"] });
    const comparison = { diffPercent: 90, avgChannelDelta: 200, dimensionMismatch: false };

    expect(shouldCompareForMotion(initialFrame, intervalFrame)).toBe(false);
    expect(
      shouldFlagLargeJump({
        comparison,
        previous: intervalFrame,
        frame: stepFrame,
        gapSec: 1,
        intervalSec: 2,
        threshold: 55,
      }),
    ).toBe(false);
    expect(
      shouldFlagLargeJump({
        comparison: { ...comparison, dimensionMismatch: true },
        previous: intervalFrame,
        frame: frame(),
        gapSec: 1,
        intervalSec: 2,
        threshold: 55,
      }),
    ).toBe(false);
    expect(
      shouldFlagLargeJump({
        comparison,
        previous: intervalFrame,
        frame: frame(),
        gapSec: 1,
        intervalSec: 2,
        threshold: 55,
      }),
    ).toBe(true);
  });

  it("maps skipped analysis to a non-passing exit code", () => {
    expect(exitCodeForStatus("pass")).toBe(0);
    expect(exitCodeForStatus("fail")).toBe(1);
    expect(exitCodeForStatus("error")).toBe(1);
    expect(exitCodeForStatus("skipped-analysis")).toBe(2);
  });
});
