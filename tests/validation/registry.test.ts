import { describe, expect, it } from "vitest";
import { registerCheck, runPhase } from "../../src/validation/registry.js";
import type { CheckContext } from "../../src/validation/types.js";

const ctx: CheckContext = {
  spec: {},
  specDir: ".",
};

describe("validation registry", () => {
  it("emits a failed result when a check throws", async () => {
    const checkName = `throws-sync-${Date.now()}`;
    registerCheck({
      name: checkName,
      phase: "post-render",
      fn: () => {
        throw new Error("sync failure");
      },
    });

    const results = await runPhase("post-render", ctx);
    const result = results.find((r) => r.checkName === checkName);

    expect(result).toMatchObject({
      phase: "post-render",
      checkName,
      status: "fail",
    });
    expect(result?.message).toContain(checkName);
    expect(result?.message).toContain("sync failure");
  });

  it("emits a failed result when a check rejects", async () => {
    const checkName = `throws-async-${Date.now()}`;
    registerCheck({
      name: checkName,
      phase: "post-render",
      fn: async () => {
        throw new Error("async failure");
      },
    });

    const results = await runPhase("post-render", ctx);
    const result = results.find((r) => r.checkName === checkName);

    expect(result).toMatchObject({
      phase: "post-render",
      checkName,
      status: "fail",
    });
    expect(result?.message).toContain(checkName);
    expect(result?.message).toContain("async failure");
  });
});
