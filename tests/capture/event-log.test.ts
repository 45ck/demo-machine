import { describe, it, expect, afterEach } from "vitest";
import { writeEventLog, readEventLog } from "../../src/capture/event-log.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import type { ActionEvent } from "../../src/playback/types.js";

describe("event-log", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  const sampleEvents: ActionEvent[] = [
    { action: "click", selector: "#btn", timestamp: 0, duration: 100 },
    { action: "type", selector: "#input", timestamp: 200, duration: 300, narration: "Type text" },
  ];

  it("writes valid JSON to the specified path", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "event-log-"));
    const outPath = join(tempDir, "events.json");

    await writeEventLog(sampleEvents, outPath);

    const result = await readEventLog(outPath);
    expect(result).toEqual(sampleEvents);
  });

  it("round-trips events through write and read", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "event-log-"));
    const outPath = join(tempDir, "events.json");

    await writeEventLog(sampleEvents, outPath);
    const loaded = await readEventLog(outPath);

    expect(loaded).toHaveLength(2);
    expect(loaded[0]?.action).toBe("click");
    expect(loaded[1]?.action).toBe("type");
    expect(loaded[1]?.narration).toBe("Type text");
  });

  it("writes empty array as valid JSON", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "event-log-"));
    const outPath = join(tempDir, "empty.json");

    await writeEventLog([], outPath);
    const loaded = await readEventLog(outPath);

    expect(loaded).toEqual([]);
  });

  it("rejects non-array JSON", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "event-log-"));
    const outPath = join(tempDir, "bad.json");

    const { writeFile } = await import("node:fs/promises");
    await writeFile(outPath, JSON.stringify({ not: "array" }), "utf-8");

    await expect(readEventLog(outPath)).rejects.toThrow("Event log must be a JSON array");
  });

  it("rejects events missing required fields", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "event-log-"));
    const outPath = join(tempDir, "bad.json");

    const { writeFile } = await import("node:fs/promises");
    await writeFile(outPath, JSON.stringify([{ action: "click" }]), "utf-8");

    await expect(readEventLog(outPath)).rejects.toThrow("timestamp");
  });
});
