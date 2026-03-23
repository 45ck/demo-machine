import { describe, it, expect } from "vitest";
import type { QualityCheckContext } from "../../src/quality/types.js";
import { checkFileSize } from "../../src/quality/checks/file-size.js";

function ctx(fileSizeBytes: number, maxOutputBytes?: number): QualityCheckContext {
  return {
    outputMp4Path: "/out/output.mp4",
    spec: { meta: { resolution: { width: 1920, height: 1080 } } },
    fileSizeBytes,
    manifestEntry:
      maxOutputBytes !== undefined ? { slug: "test-suite", maxOutputBytes } : undefined,
  };
}

describe("checkFileSize", () => {
  it("passes when file size is under maxOutputBytes", () => {
    const results = checkFileSize(ctx(5_000_000, 10_000_000));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("pass");
  });

  it("fails when file size exceeds maxOutputBytes", () => {
    const results = checkFileSize(ctx(15_000_000, 10_000_000));
    expect(results[0]!.status).toBe("fail");
  });

  it("passes (skip) when manifestEntry has no maxOutputBytes field", () => {
    const c: QualityCheckContext = {
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      fileSizeBytes: 5_000_000,
      manifestEntry: { slug: "test-suite" },
    };
    const results = checkFileSize(c);
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.message).toMatch(/no budget/i);
  });

  it("passes (skip) when no manifestEntry is provided", () => {
    const c: QualityCheckContext = {
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      fileSizeBytes: 5_000_000,
    };
    const results = checkFileSize(c);
    expect(results[0]!.status).toBe("pass");
    expect(results[0]!.message).toMatch(/no budget/i);
  });

  it("includes actual size, budget, and percentage in failure message", () => {
    const results = checkFileSize(ctx(12_000_000, 10_000_000));
    const fail = results[0]!;
    expect(fail.status).toBe("fail");
    expect(fail.message).toMatch(/12.0/); // 12 MB approx
    expect(fail.message).toMatch(/10.0/); // budget
    expect(fail.message).toMatch(/120/); // 120%
  });

  it("boundary: exactly at maxOutputBytes passes", () => {
    const results = checkFileSize(ctx(10_000_000, 10_000_000));
    expect(results[0]!.status).toBe("pass");
  });

  it("boundary: one byte over maxOutputBytes fails", () => {
    const results = checkFileSize(ctx(10_000_001, 10_000_000));
    expect(results[0]!.status).toBe("fail");
  });

  it("fails when file size is 0 (empty file)", () => {
    const results = checkFileSize(ctx(0, 10_000_000));
    expect(results[0]!.status).toBe("fail");
    expect(results[0]!.message).toMatch(/empty/i);
  });

  it("warns when fileSizeBytes is undefined and budget is configured", () => {
    const c: QualityCheckContext = {
      outputMp4Path: "/out/output.mp4",
      spec: { meta: { resolution: { width: 1920, height: 1080 } } },
      manifestEntry: { slug: "test-suite", maxOutputBytes: 10_000_000 },
    };
    const results = checkFileSize(c);
    expect(results[0]!.status).toBe("warn");
    expect(results[0]!.message).toMatch(/stat failed/i);
  });

  it("warns when maxOutputBytes is 0 (invalid budget)", () => {
    const results = checkFileSize(ctx(5_000_000, 0));
    expect(results[0]!.status).toBe("warn");
  });

  it("all results have phase post-render and checkName file-size-budget", () => {
    const results = checkFileSize(ctx(5_000_000, 10_000_000));
    expect(results[0]!.phase).toBe("post-render");
    expect(results[0]!.checkName).toBe("file-size-budget");
  });
});
