import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPosterArgs, ensurePosterAsset } from "../../src/share/poster.js";

describe("share viewer poster generation", () => {
  let outputDir: string;
  let videoPath: string;
  let posterPath: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), "demo-share-poster-"));
    videoPath = join(outputDir, "output.mp4");
    posterPath = join(outputDir, "poster.png");
    await writeFile(videoPath, "video fixture", "utf8");
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("uses the video midpoint and deterministic PNG settings", () => {
    expect(buildPosterArgs({ videoPath, posterPath, durationMs: 8_000 })).toEqual(
      expect.arrayContaining([
        "-ss",
        "4.000",
        "-vf",
        "scale=1280:-2:flags=lanczos",
        "-map_metadata",
        "-1",
        "-c:v",
        "png",
        "-threads",
        "1",
      ]),
    );
    const shortArgs = buildPosterArgs({ videoPath, posterPath, durationMs: 500 });
    expect(shortArgs[shortArgs.indexOf("-ss") + 1]).toBe("0.250");
  });

  it("generates a missing PNG through shell-free ffmpeg output and atomically installs it", async () => {
    const commandRunner = vi.fn(async (command: string, args: readonly string[]) => {
      expect(command).toBe("ffmpeg");
      expect(args).toContain("-nostdin");
      await writeFile(args.at(-1)!, "generated poster", "utf8");
    });

    await expect(
      ensurePosterAsset({ videoPath, posterPath, durationMs: 8_000, commandRunner }),
    ).resolves.toBe(posterPath);
    expect(await readFile(posterPath, "utf8")).toBe("generated poster");
    expect(commandRunner).toHaveBeenCalledOnce();
  });

  it("regenerates its own poster when the source video changes", async () => {
    let generation = 0;
    const commandRunner = vi.fn(async (_command: string, args: readonly string[]) => {
      generation += 1;
      await writeFile(args.at(-1)!, `generated poster ${String(generation)}`, "utf8");
    });

    await ensurePosterAsset({ videoPath, posterPath, durationMs: 8_000, commandRunner });
    expect(await readFile(posterPath, "utf8")).toBe("generated poster 1");
    await writeFile(videoPath, "changed video fixture", "utf8");
    await ensurePosterAsset({ videoPath, posterPath, durationMs: 8_000, commandRunner });

    expect(await readFile(posterPath, "utf8")).toBe("generated poster 2");
    expect(commandRunner).toHaveBeenCalledTimes(2);
  });

  it("retries at the first frame when ffmpeg exits without producing a frame", async () => {
    const commandRunner = vi.fn(async (_command: string, args: readonly string[]) => {
      const seekIndex = args.indexOf("-ss");
      if (args[seekIndex + 1] === "0.000") {
        await writeFile(args.at(-1)!, "first frame poster", "utf8");
      }
    });

    await ensurePosterAsset({ videoPath, posterPath, durationMs: 500, commandRunner });

    expect(await readFile(posterPath, "utf8")).toBe("first frame poster");
    expect(commandRunner).toHaveBeenCalledTimes(2);
  });

  it("preserves an existing regular poster without invoking ffmpeg", async () => {
    await writeFile(posterPath, "reviewed poster", "utf8");
    const commandRunner = vi.fn();
    await expect(
      ensurePosterAsset({ videoPath, posterPath, durationMs: 8_000, commandRunner }),
    ).resolves.toBe(posterPath);
    expect(await readFile(posterPath, "utf8")).toBe("reviewed poster");
    expect(commandRunner).not.toHaveBeenCalled();
  });

  it("preserves a manually replaced poster even when generated provenance remains", async () => {
    const commandRunner = vi.fn(async (_command: string, args: readonly string[]) => {
      await writeFile(args.at(-1)!, "generated poster", "utf8");
    });
    await ensurePosterAsset({ videoPath, posterPath, durationMs: 8_000, commandRunner });
    await writeFile(posterPath, "reviewed replacement", "utf8");
    await writeFile(videoPath, "new video", "utf8");

    await ensurePosterAsset({ videoPath, posterPath, durationMs: 8_000, commandRunner });

    expect(await readFile(posterPath, "utf8")).toBe("reviewed replacement");
    expect(commandRunner).toHaveBeenCalledOnce();
  });

  it("fails closed for a missing non-PNG poster", async () => {
    await expect(
      ensurePosterAsset({
        videoPath,
        posterPath: join(outputDir, "poster.webp"),
        durationMs: 8_000,
      }),
    ).rejects.toThrow("Automatic poster generation requires a .png filename");
  });

  it("does not replace a poster symlink", async () => {
    const externalPoster = `${outputDir}-external.png`;
    await writeFile(externalPoster, "external poster", "utf8");
    await symlink(externalPoster, posterPath);
    try {
      await expect(ensurePosterAsset({ videoPath, posterPath, durationMs: 8_000 })).rejects.toThrow(
        "Poster must be a regular sibling file",
      );
      expect(await readFile(externalPoster, "utf8")).toBe("external poster");
    } finally {
      await rm(externalPoster, { force: true });
    }
  });
});
