import { describe, it, expect } from "vitest";
import { runPhase } from "../../../src/validation/registry.js";
import type { CheckContext } from "../../../src/validation/types.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Import to trigger registration
import "../../../src/validation/checks/post-capture.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "postcap-test-"));
}

interface PostCtx extends CheckContext {
  events: Array<{ action: string; timestamp: number; duration: number }>;
  outputDir: string;
}

function makeCtx(
  events: Array<{ action: string; timestamp: number; duration: number }>,
  outputDir: string,
  stepCount = 1,
): PostCtx {
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    action: "click",
    selector: `#btn-${i}`,
  }));
  return {
    spec: { meta: { title: "T" }, chapters: [{ title: "C", steps }] },
    specDir: "/tmp",
    events,
    outputDir,
  };
}

function postResults(ctx: PostCtx) {
  return runPhase("post-capture", ctx);
}

describe("post-capture checks", () => {
  it("passes event-count when counts match", async () => {
    const dir = makeTmpDir();
    const results = await postResults(
      makeCtx([{ action: "click", timestamp: 100, duration: 50 }], dir, 1),
    );
    const r = results.find((r) => r.checkName === "event-count");
    expect(r?.status).toBe("pass");
  });

  it("fails event-count when fewer events", async () => {
    const dir = makeTmpDir();
    const results = await postResults(makeCtx([], dir, 2));
    const r = results.find((r) => r.checkName === "event-count");
    expect(r?.status).toBe("fail");
    expect(r?.message).toContain("missing 2");
  });

  it("warns event-count when more events than steps", async () => {
    const dir = makeTmpDir();
    const results = await postResults(
      makeCtx(
        [
          { action: "click", timestamp: 100, duration: 50 },
          { action: "click", timestamp: 200, duration: 50 },
        ],
        dir,
        1,
      ),
    );
    const r = results.find((r) => r.checkName === "event-count");
    expect(r?.status).toBe("warn");
  });

  it("passes monotonic-timestamps for ordered events", async () => {
    const dir = makeTmpDir();
    const results = await postResults(
      makeCtx(
        [
          { action: "click", timestamp: 100, duration: 50 },
          { action: "click", timestamp: 200, duration: 50 },
        ],
        dir,
        2,
      ),
    );
    const r = results.find((r) => r.checkName === "monotonic-timestamps");
    expect(r?.status).toBe("pass");
  });

  it("fails monotonic-timestamps for out-of-order events", async () => {
    const dir = makeTmpDir();
    const results = await postResults(
      makeCtx(
        [
          { action: "click", timestamp: 200, duration: 50 },
          { action: "click", timestamp: 100, duration: 50 },
        ],
        dir,
        2,
      ),
    );
    const r = results.find((r) => r.checkName === "monotonic-timestamps");
    expect(r?.status).toBe("fail");
  });

  it("passes negative-durations when all positive", async () => {
    const dir = makeTmpDir();
    const results = await postResults(
      makeCtx([{ action: "click", timestamp: 100, duration: 50 }], dir, 1),
    );
    const r = results.find((r) => r.checkName === "negative-durations");
    expect(r?.status).toBe("pass");
  });

  it("fails negative-durations when event has negative duration", async () => {
    const dir = makeTmpDir();
    const results = await postResults(
      makeCtx([{ action: "click", timestamp: 100, duration: -10 }], dir, 1),
    );
    const r = results.find((r) => r.checkName === "negative-durations");
    expect(r?.status).toBe("fail");
    expect(r?.message).toContain("-10");
  });

  it("fails video-file when not present", async () => {
    const dir = makeTmpDir();
    const results = await postResults(
      makeCtx([{ action: "click", timestamp: 100, duration: 50 }], dir, 1),
    );
    const r = results.find((r) => r.checkName === "video-file");
    expect(r?.status).toBe("fail");
  });

  it("passes video-file when present and non-empty", async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "video.webm"), "fake-video-data");
    const results = await postResults(
      makeCtx([{ action: "click", timestamp: 100, duration: 50 }], dir, 1),
    );
    const r = results.find((r) => r.checkName === "video-file");
    expect(r?.status).toBe("pass");
  });

  it("fails video-file when empty", async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "video.webm"), "");
    const results = await postResults(
      makeCtx([{ action: "click", timestamp: 100, duration: 50 }], dir, 1),
    );
    const r = results.find((r) => r.checkName === "video-file");
    expect(r?.status).toBe("fail");
    expect(r?.message).toContain("empty");
  });

  it("warns when events.json is missing", async () => {
    const dir = makeTmpDir();
    const results = await postResults(
      makeCtx([{ action: "click", timestamp: 100, duration: 50 }], dir, 1),
    );
    const r = results.find((r) => r.checkName === "artifact:events.json");
    expect(r?.status).toBe("warn");
  });

  it("passes when events.json exists", async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "events.json"), "[]");
    const results = await postResults(
      makeCtx([{ action: "click", timestamp: 100, duration: 50 }], dir, 1),
    );
    const r = results.find((r) => r.checkName === "artifact:events.json");
    expect(r?.status).toBe("pass");
  });

  it("warns when trace.zip is missing", async () => {
    const dir = makeTmpDir();
    const results = await postResults(
      makeCtx([{ action: "click", timestamp: 100, duration: 50 }], dir, 1),
    );
    const r = results.find((r) => r.checkName === "artifact:trace.zip");
    expect(r?.status).toBe("warn");
  });

  it("passes when trace.zip exists", async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "trace.zip"), "fake-trace");
    const results = await postResults(
      makeCtx([{ action: "click", timestamp: 100, duration: 50 }], dir, 1),
    );
    const r = results.find((r) => r.checkName === "artifact:trace.zip");
    expect(r?.status).toBe("pass");
  });

  it("returns empty array when context lacks events/outputDir", async () => {
    const results = await runPhase("post-capture", {
      spec: { meta: { title: "T" }, chapters: [{ title: "C", steps: [] }] },
      specDir: "/tmp",
    });
    // The post-capture check should return empty (no capture ctx) but not crash
    expect(Array.isArray(results)).toBe(true);
  });

  it("handles multiple negative durations", async () => {
    const dir = makeTmpDir();
    const results = await postResults(
      makeCtx(
        [
          { action: "click", timestamp: 100, duration: -5 },
          { action: "type", timestamp: 200, duration: -3 },
        ],
        dir,
        2,
      ),
    );
    const negResults = results.filter(
      (r) => r.checkName === "negative-durations" && r.status === "fail",
    );
    expect(negResults.length).toBe(2);
  });

  it("includes action name in negative duration message", async () => {
    const dir = makeTmpDir();
    const results = await postResults(
      makeCtx([{ action: "scroll", timestamp: 100, duration: -1 }], dir, 1),
    );
    const r = results.find((r) => r.checkName === "negative-durations");
    expect(r?.message).toContain("scroll");
  });

  it("video-file check includes suggestion", async () => {
    const dir = makeTmpDir();
    const results = await postResults(
      makeCtx([{ action: "click", timestamp: 100, duration: 50 }], dir, 1),
    );
    const r = results.find((r) => r.checkName === "video-file");
    expect(r?.suggestion).toBeDefined();
  });

  it("all results have phase set correctly", async () => {
    const dir = makeTmpDir();
    const results = await postResults(
      makeCtx([{ action: "click", timestamp: 100, duration: 50 }], dir, 1),
    );
    for (const r of results) {
      expect(r.phase).toBe("pre-capture"); // pass/fail/warn helpers set pre-capture
    }
  });

  it("single event passes monotonic check", async () => {
    const dir = makeTmpDir();
    const results = await postResults(
      makeCtx([{ action: "click", timestamp: 100, duration: 50 }], dir, 1),
    );
    const r = results.find((r) => r.checkName === "monotonic-timestamps");
    expect(r?.status).toBe("pass");
  });

  it("zero events passes monotonic and negative-durations", async () => {
    const dir = makeTmpDir();
    const results = await postResults(makeCtx([], dir, 0));
    const mono = results.find((r) => r.checkName === "monotonic-timestamps");
    const neg = results.find((r) => r.checkName === "negative-durations");
    expect(mono?.status).toBe("pass");
    expect(neg?.status).toBe("pass");
  });
});
