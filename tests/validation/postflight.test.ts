import { describe, it, expect } from "vitest";
import { postflight } from "../../src/validation/postflight.js";

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "postflight-test-"));
}

function makeCtx(outputDir: string, events: unknown[] = []) {
  return {
    spec: {
      meta: { title: "Test" },
      chapters: [{ title: "Ch1", steps: [{ action: "click", selector: "#btn" }] }],
    },
    specDir: "/tmp",
    events,
    outputDir,
  };
}

describe("postflight", () => {
  it("returns results array", async () => {
    const dir = makeTmpDir();
    const results = await postflight(
      makeCtx(dir, [{ action: "click", timestamp: 100, duration: 50 }]),
    );
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("reports event count mismatch", async () => {
    const dir = makeTmpDir();
    const results = await postflight(makeCtx(dir, []));
    const countResult = results.find((r) => r.checkName === "event-count");
    expect(countResult?.status).toBe("fail");
  });

  it("passes event count when matching", async () => {
    const dir = makeTmpDir();
    const results = await postflight(
      makeCtx(dir, [{ action: "click", timestamp: 100, duration: 50 }]),
    );
    const countResult = results.find((r) => r.checkName === "event-count");
    expect(countResult?.status).toBe("pass");
  });

  it("merges monitor issues into results", async () => {
    const dir = makeTmpDir();
    const results = await postflight(
      makeCtx(dir, [{ action: "click", timestamp: 100, duration: 50 }]),
      [{ monitor: "console", severity: "warn", message: "test warning" }],
    );
    const monitorResult = results.find((r) => r.checkName === "monitor:console");
    expect(monitorResult).toBeDefined();
    expect(monitorResult?.status).toBe("warn");
  });

  it("converts error-severity monitor issues to fail", async () => {
    const dir = makeTmpDir();
    const results = await postflight(
      makeCtx(dir, [{ action: "click", timestamp: 100, duration: 50 }]),
      [{ monitor: "page-lifecycle", severity: "error", message: "Page crashed" }],
    );
    const monitorResult = results.find((r) => r.checkName === "monitor:page-lifecycle");
    expect(monitorResult?.status).toBe("fail");
  });

  it("returns results without monitor issues", async () => {
    const dir = makeTmpDir();
    const results = await postflight(
      makeCtx(dir, [{ action: "click", timestamp: 100, duration: 50 }]),
    );
    const monitorResults = results.filter((r) => r.checkName.startsWith("monitor:"));
    expect(monitorResults).toHaveLength(0);
  });

  it("check results have phase field set", async () => {
    const dir = makeTmpDir();
    const results = await postflight(
      makeCtx(dir, [{ action: "click", timestamp: 100, duration: 50 }]),
    );
    for (const r of results) {
      expect(["pre-capture", "post-capture"]).toContain(r.phase);
    }
  });
});
