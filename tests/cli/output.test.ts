import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  OutputCollisionError,
  createRunId,
  resolveOutputDirectory,
  resolveOutputOptions,
  slugifyOutputName,
  writeLatestOutputPointer,
} from "../../src/cli/output.js";
import type { GlobalOptions } from "../../src/cli/options.js";
import type { DemoSpec } from "../../src/spec/types.js";

const spec = {
  meta: { title: "Checkout Flow Demo", resolution: { width: 1280, height: 720 } },
} as Pick<DemoSpec, "meta">;

function makeOptions(output: string): GlobalOptions {
  return {
    output,
    overwrite: false,
    narration: true,
    edit: true,
    renderer: "ffmpeg",
    ttsProvider: "kokoro",
    narrationSync: "manual",
    narrationBuffer: 500,
    verbose: false,
    headless: true,
    strictGeometry: false,
    trimStartMs: 0,
    timeline: false,
  };
}

describe("output resolution", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "dm-output-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates slugs from demo titles for automatic output folders", () => {
    expect(slugifyOutputName("Checkout Flow Demo!")).toBe("checkout-flow-demo");
  });

  it("creates stable filesystem-safe run ids", () => {
    expect(createRunId(new Date(2026, 3, 24, 1, 2, 3, 4))).toMatch(/^\d{8}-\d{6}-\d{3}$/);
  });

  it("puts default output in a unique spec and run-id directory", async () => {
    const result = await resolveOutputDirectory({
      spec,
      requestedOutput: "./output",
      outputWasExplicit: false,
      now: new Date(2026, 3, 24, 1, 2, 3, 4),
      cwd: tempDir,
    });

    expect(result).toEqual({
      outputDir: join(tempDir, "output", "checkout-flow-demo", "20260424-010203-004"),
      outputRoot: join(tempDir, "output"),
      mode: "automatic",
      slug: "checkout-flow-demo",
      runId: "20260424-010203-004",
    });
  });

  it("keeps explicit output paths when they do not contain demo artifacts", async () => {
    const result = await resolveOutputDirectory({
      spec,
      requestedOutput: "./custom",
      outputWasExplicit: true,
      cwd: tempDir,
    });

    expect(result.outputDir).toBe(resolve(tempDir, "custom"));
    expect(result.mode).toBe("explicit");
    expect(result.runId).toBeUndefined();
  });

  it("blocks explicit output paths that already contain demo artifacts", async () => {
    const outputDir = join(tempDir, "custom");
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "output.mp4"), "old", "utf8");
    await writeFile(join(outputDir, "events.json"), "[]", "utf8");

    await expect(
      resolveOutputDirectory({
        spec,
        requestedOutput: outputDir,
        outputWasExplicit: true,
        cwd: tempDir,
      }),
    ).rejects.toMatchObject({
      outputDir,
      artifactNames: ["events.json", "output.mp4"],
    } satisfies Partial<OutputCollisionError>);
  });

  it("allows explicit artifact reuse when overwrite is set", async () => {
    const outputDir = join(tempDir, "custom");
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "video.webm"), "old", "utf8");

    const result = await resolveOutputDirectory({
      spec,
      requestedOutput: outputDir,
      outputWasExplicit: true,
      overwrite: true,
      cwd: tempDir,
    });

    expect(result.outputDir).toBe(outputDir);
  });

  it("returns options with absolute output and resolution metadata", async () => {
    const { opts, resolution } = await resolveOutputOptions({
      opts: makeOptions("./output"),
      spec,
      outputWasExplicit: false,
      now: new Date(2026, 3, 24, 1, 2, 3, 4),
    });

    expect(opts.output).toContain(join("output", "checkout-flow-demo", "20260424-010203-004"));
    expect(opts.outputMode).toBe("automatic");
    expect(opts.outputRoot).toBe(resolve("./output"));
    expect(opts.outputSlug).toBe("checkout-flow-demo");
    expect(opts.outputRunId).toBe("20260424-010203-004");
    expect(resolution.mode).toBe("automatic");
  });

  it("writes a latest pointer for automatic outputs", async () => {
    const outputRoot = join(tempDir, "output");
    const outputDir = join(outputRoot, "checkout-flow-demo", "20260424-010203-004");

    const latestPath = await writeLatestOutputPointer({
      outputRoot,
      mode: "run",
      title: "Checkout Flow Demo",
      specPath: "checkout.demo.yaml",
      outputDir,
      videoPath: join(outputDir, "video.webm"),
      renderedVideoPath: join(outputDir, "output.mp4"),
      eventCount: 4,
      artifacts: { verificationPath: join(outputDir, "verification.json") },
    });

    expect(latestPath).toBe(join(outputRoot, "latest.json"));
    const latest = JSON.parse(await readFile(latestPath!, "utf8")) as Record<string, unknown>;
    expect(latest["mode"]).toBe("run");
    expect(latest["outputDir"]).toBe(outputDir);
    expect(latest["renderedVideoPath"]).toBe(join(outputDir, "output.mp4"));
    expect(latest["eventCount"]).toBe(4);
  });
});
