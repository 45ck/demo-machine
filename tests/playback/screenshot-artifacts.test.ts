import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateScreenshotArtifactManifestConsistency,
  writeScreenshotArtifacts,
} from "../../src/playback/screenshot-artifacts.js";
import type { ScreenshotCollectorResults } from "../../src/playback/screenshot-collector.js";

describe("writeScreenshotArtifacts", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "screenshot-artifacts-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns undefined when no screenshot evidence exists", async () => {
    const result = await writeScreenshotArtifacts({
      outputDir: tempDir,
      results: {
        stepScreenshots: new Map(),
        assertScreenshotPairs: [],
        cursorPositions: [],
        chapterTitleScreenshots: new Map(),
      },
    });

    expect(result).toBeUndefined();
  });

  it("writes screenshots and a manifest for collected evidence", async () => {
    const results: ScreenshotCollectorResults = {
      stepScreenshots: new Map([
        [2, Buffer.from("step two")],
        [0, Buffer.from("step zero")],
      ]),
      assertScreenshotPairs: [
        { stepIndex: 1, before: Buffer.from("before"), after: Buffer.from("after") },
      ],
      cursorPositions: [
        { stepIndex: 1, cursorX: 10, cursorY: 20, targetCenterX: 10, targetCenterY: 20 },
      ],
      chapterTitleScreenshots: new Map([[0, Buffer.from("chapter zero")]]),
    };

    const artifact = await writeScreenshotArtifacts({ outputDir: tempDir, results });

    expect(artifact).toBeDefined();
    expect(artifact!.screenshotPaths).toHaveLength(5);
    expect(await readFile(join(tempDir, "screenshots", "step-0000.png"), "utf8")).toBe("step zero");
    expect(await readFile(join(tempDir, "screenshots", "step-0002.png"), "utf8")).toBe("step two");
    expect(await readFile(join(tempDir, "screenshots", "assert-0001-before.png"), "utf8")).toBe(
      "before",
    );
    expect(await readFile(join(tempDir, "screenshots", "assert-0001-after.png"), "utf8")).toBe(
      "after",
    );
    expect(await readFile(join(tempDir, "screenshots", "chapter-0000-title.png"), "utf8")).toBe(
      "chapter zero",
    );

    const manifest = JSON.parse(await readFile(artifact!.manifestPath, "utf8")) as {
      counts: Record<string, number>;
      stepScreenshots: Array<{ stepIndex: number; path: string }>;
      cursorPositions: unknown[];
    };

    expect(manifest.counts).toEqual({
      stepScreenshots: 2,
      assertScreenshotPairs: 1,
      cursorPositions: 1,
      chapterTitleScreenshots: 1,
    });
    expect(manifest.stepScreenshots.map((entry) => entry.stepIndex)).toEqual([0, 2]);
    expect(manifest.cursorPositions).toHaveLength(1);
    expect(
      validateScreenshotArtifactManifestConsistency({
        manifest: artifact!.manifest,
        screenshotPaths: artifact!.screenshotPaths,
      }),
    ).toEqual([]);
  });

  it("reports manifest count and screenshot path inconsistencies", async () => {
    const artifact = await writeScreenshotArtifacts({
      outputDir: tempDir,
      results: {
        stepScreenshots: new Map([[0, Buffer.from("step zero")]]),
        assertScreenshotPairs: [],
        cursorPositions: [],
        chapterTitleScreenshots: new Map(),
      },
    });

    expect(artifact).toBeDefined();
    const issues = validateScreenshotArtifactManifestConsistency({
      manifest: {
        ...artifact!.manifest,
        counts: { ...artifact!.manifest.counts, stepScreenshots: 2 },
      },
      screenshotPaths: [...artifact!.screenshotPaths, join(tempDir, "screenshots", "extra.png")],
    });

    expect(issues).toEqual([
      "stepScreenshots count mismatch: counts.stepScreenshots=2, entries=1",
      `screenshotPaths entry missing from manifest: ${join(tempDir, "screenshots", "extra.png")}`,
    ]);
  });
});
