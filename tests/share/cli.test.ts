import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateShareViewerFromOutput } from "../../src/cli/share.js";

const mocks = vi.hoisted(() => ({ probeVideo: vi.fn() }));

vi.mock("../../src/quality/ffprobe.js", () => ({ probeVideo: mocks.probeVideo }));

describe("share CLI integration", () => {
  let tempDir: string;
  let outputDir: string;
  let specPath: string;

  beforeEach(async () => {
    mocks.probeVideo.mockResolvedValue({ videoDurationSec: 12.5 });
    tempDir = await mkdtemp(join(tmpdir(), "demo-share-cli-"));
    outputDir = join(tempDir, "output");
    specPath = join(tempDir, "flow.demo.json");
    await mkdir(outputDir);
    await writeFile(join(outputDir, "output.mp4"), "video", "utf8");
    await writeFile(
      join(outputDir, "events.json"),
      JSON.stringify([{ action: "wait", timestamp: 5_000, duration: 100 }]),
      "utf8",
    );
    await writeFile(
      specPath,
      JSON.stringify({
        meta: { title: "Share command" },
        share: {
          summary: "A self-contained viewing surface.",
          profile: {
            label: "NDIS",
            syntheticBoundary: "Synthetic demonstration data only. Not for clinical use.",
          },
          primaryCta: { label: "Try it", url: "http://localhost:3000" },
        },
        chapters: [
          {
            title: "Start",
            steps: [
              {
                action: "wait",
                timeout: 100,
                narration: "Open the reviewed silent demonstration.",
              },
            ],
          },
        ],
      }),
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("generates beside existing output without recapturing", async () => {
    const result = await generateShareViewerFromOutput({ specPath, outputDir });
    expect(result.viewerPath).toBe(join(outputDir, "viewer.html"));
    expect(result.manifestPath).toBe(join(outputDir, "viewer.manifest.json"));
    expect(result.manifest.durationMs).toBe(12_500);
    expect(mocks.probeVideo).toHaveBeenCalledWith(join(outputDir, "output.mp4"));
    expect(await readFile(result.viewerPath, "utf8")).toContain("Share command");
    expect(await readFile(join(outputDir, "subtitles.vtt"), "utf8")).toContain(
      "Open the reviewed silent demonstration.",
    );
    expect(result.manifest.media.captions?.cueCount).toBe(1);
  });
});
