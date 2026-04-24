import { writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runPostflight } from "../../src/cli/capture-postflight.js";

describe("capture postflight", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `demo-machine-postflight-${String(Date.now())}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("passes when required post-capture checks pass", async () => {
    await writeFile(join(tempDir, "video.webm"), "video");
    await writeFile(join(tempDir, "trace.zip"), "trace");

    await expect(
      runPostflight({
        spec: {
          chapters: [{ title: "Intro", steps: [{ action: "navigate", url: "/" }] }],
        },
        events: [{ action: "navigate", timestamp: 1, duration: 2 }],
        opts: { output: tempDir },
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects when post-capture verification fails", async () => {
    await expect(
      runPostflight({
        spec: {
          chapters: [{ title: "Intro", steps: [{ action: "navigate", url: "/" }] }],
        },
        events: [],
        opts: { output: tempDir },
      }),
    ).rejects.toThrow("Postflight verification failed");
  });
});
