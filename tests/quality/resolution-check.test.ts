import { describe, it, expect } from "vitest";
import type { QualityCheckContext } from "../../src/quality/types.js";
import { checkResolution } from "../../src/quality/checks/resolution.js";

function ctx(overrides?: Partial<QualityCheckContext>): QualityCheckContext {
  return {
    outputMp4Path: "/out/output.mp4",
    spec: { meta: { resolution: { width: 1920, height: 1080 } } },
    probeResult: {
      width: 1920,
      height: 1080,
      sar: "1:1",
      videoCodec: "h264",
      pixFmt: "yuv420p",
      containerFormat: "mov,mp4,m4a,3gp,3g2,mj2",
      videoDurationSec: 10,
      audioDurationSec: 10,
    },
    ...overrides,
  };
}

describe("checkResolution", () => {
  it("passes when probed resolution matches spec resolution", () => {
    const results = checkResolution(ctx());
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "pass")).toBe(true);
  });

  it("fails when width does not match", () => {
    const c = ctx();
    c.probeResult!.width = 1280;
    const results = checkResolution(c);
    const fail = results.find((r) => r.status === "fail");
    expect(fail).toBeDefined();
    expect(fail!.message).toContain("1280");
    expect(fail!.message).toContain("1920");
  });

  it("fails when height does not match", () => {
    const c = ctx();
    c.probeResult!.height = 720;
    const results = checkResolution(c);
    const fail = results.find((r) => r.status === "fail");
    expect(fail).toBeDefined();
    expect(fail!.message).toContain("720");
    expect(fail!.message).toContain("1080");
  });

  it("fails when SAR is not 1:1", () => {
    const c = ctx();
    c.probeResult!.sar = "4:3";
    const results = checkResolution(c);
    const fail = results.find((r) => r.status === "fail");
    expect(fail).toBeDefined();
    expect(fail!.message).toContain("4:3");
  });

  it("passes when SAR is 1:1", () => {
    const results = checkResolution(ctx());
    const sarResult = results.find((r) => r.checkName === "resolution:sar");
    expect(sarResult).toBeDefined();
    expect(sarResult!.status).toBe("pass");
  });

  it("includes expected and actual dimensions in failure message", () => {
    const c = ctx();
    c.probeResult!.width = 800;
    c.probeResult!.height = 600;
    const results = checkResolution(c);
    const fail = results.find((r) => r.checkName === "resolution:dimensions");
    expect(fail!.status).toBe("fail");
    expect(fail!.message).toMatch(/800x600/);
    expect(fail!.message).toMatch(/1920x1080/);
  });

  it("all results have phase post-render", () => {
    const results = checkResolution(ctx());
    for (const r of results) {
      expect(r.phase).toBe("post-render");
    }
  });

  it("returns warn when probeResult is undefined", () => {
    const results = checkResolution({ ...ctx(), probeResult: undefined });
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
  });
});
