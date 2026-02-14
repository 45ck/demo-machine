#!/usr/bin/env node
/* eslint-disable @typescript-eslint/unbound-method */

import { Command } from "commander";
import { loadSpec } from "./spec/loader.js";
import type { DemoSpec } from "./spec/types.js";
import type { ActionEvent } from "./playback/types.js";
import type { PlaywrightPage } from "./playback/actions.js";
import { createLogger, setLogLevel } from "./utils/logger.js";

const logger = createLogger("cli");

interface GlobalOptions {
  output: string;
  narration: boolean;
  edit: boolean;
  renderer: string;
  ttsProvider: string;
  verbose: boolean;
  headless: boolean;
}

function applyGlobalOptions(opts: GlobalOptions): void {
  if (opts.verbose) {
    setLogLevel("debug");
  }
}

const program = new Command();

program
  .name("demo-machine")
  .description("Demo as code — automate polished product demo videos from YAML specs")
  .version("0.1.0")
  .option("-o, --output <dir>", "Output directory", "./output")
  .option("--no-narration", "Skip narration")
  .option("--no-edit", "Skip editing (raw capture only)")
  .option("--renderer <name>", "Renderer: ffmpeg", "ffmpeg")
  .option("--tts-provider <name>", "TTS: kokoro (local) | openai | elevenlabs | piper", "kokoro")
  .option("--verbose", "Verbose logging", false)
  .option("--headless", "Run browser in headless mode", true)
  .option("--no-headless", "Run browser in headed mode");

program
  .command("validate <spec>")
  .description("Validate a demo spec file")
  .action(async (specPath: string) => {
    const opts = program.opts<GlobalOptions>();
    applyGlobalOptions(opts);
    try {
      const spec = await loadSpec(specPath);
      logger.info(`Spec valid: "${spec.meta.title}" (${String(spec.chapters.length)} chapters)`);
    } catch (err) {
      logger.error(String(err));
      process.exitCode = 1;
    }
  });

program
  .command("capture <spec>")
  .description("Run app + capture raw video (no editing)")
  .action(async (specPath: string) => {
    const opts = program.opts<GlobalOptions>();
    applyGlobalOptions(opts);
    try {
      const bundle = await captureFromSpec(specPath, opts);
      logger.info(`Capture complete: ${bundle.videoPath}`);
    } catch (err) {
      logger.error(String(err));
      process.exitCode = 1;
    }
  });

program
  .command("run <spec>")
  .description("Full pipeline: capture + edit + narrate")
  .action(async (specPath: string) => {
    const opts = program.opts<GlobalOptions>();
    applyGlobalOptions(opts);
    try {
      await runFullPipeline(specPath, opts);
    } catch (err) {
      logger.error(String(err));
      process.exitCode = 1;
    }
  });

program
  .command("edit <events>")
  .description("Edit from existing event log + raw video")
  .action(async (eventsPath: string) => {
    const opts = program.opts<GlobalOptions>();
    applyGlobalOptions(opts);
    try {
      await runEditPipeline(eventsPath, opts);
    } catch (err) {
      logger.error(String(err));
      process.exitCode = 1;
    }
  });

interface CaptureResult {
  videoPath: string;
  events: ActionEvent[];
  spec: DemoSpec;
}

async function captureFromSpec(specPath: string, opts: GlobalOptions): Promise<CaptureResult> {
  const runnerMod = await import("./runner/runner.js");
  const captureMod = await import("./capture/recorder.js");
  const { PlaybackEngine } = await import("./playback/engine.js");
  const pw = await import("playwright");

  const spec = await loadSpec(specPath);
  logger.info(`Running: "${spec.meta.title}"`);

  const handle = spec.runner?.command
    ? await runnerMod.startRunner(runnerMod.createRunnerOptions(spec.runner))
    : undefined;

  try {
    const browser = await pw.chromium.launch({
      headless: opts.headless,
    });
    const captureOpts = {
      outputDir: opts.output,
      resolution: spec.meta.resolution,
    };
    const recording = await captureMod.createRecordingContext(
      browser as unknown as Parameters<typeof captureMod.createRecordingContext>[0],
      captureOpts,
    );

    const page = recording.page as unknown as PlaywrightPage;
    const engine = new PlaybackEngine(page, {
      baseUrl: spec.runner?.url ?? "http://localhost:3000",
      redactionSelectors: spec.redaction?.selectors,
      secretPatterns: spec.redaction?.secrets,
      pacing: spec.pacing,
    });

    const result = await engine.execute(spec.chapters);
    const bundle = await captureMod.finalizeCapture(
      recording.context,
      recording.page,
      result.events,
      captureOpts,
    );
    await browser.close();

    return { videoPath: bundle.videoPath, events: result.events, spec };
  } finally {
    await handle?.stop();
  }
}

async function runFullPipeline(specPath: string, opts: GlobalOptions): Promise<void> {
  const capture = await captureFromSpec(specPath, opts);

  if (!opts.edit) {
    logger.info(`Capture complete: ${capture.videoPath}`);
    return;
  }

  const { buildTimeline } = await import("./editor/timeline.js");
  const { createRenderer } = await import("./editor/renderer.js");
  const { join } = await import("node:path");

  const timeline = buildTimeline(capture.events, capture.spec);
  const renderer = createRenderer(opts.renderer);
  const outputPath = join(opts.output, "output.mp4");

  let audioPath: string | undefined;
  if (opts.narration) {
    audioPath = await synthesizeAudio(capture.spec, capture.events, opts);
  }

  const branding = capture.spec.meta.branding;
  const colors = branding?.colors;

  const renderBranding: { logo?: string; colors?: { primary: string; background: string } } = {};
  if (branding?.logo) {
    renderBranding.logo = branding.logo;
  }
  if (colors?.primary && colors.background) {
    renderBranding.colors = { primary: colors.primary, background: colors.background };
  }

  await renderer.render(timeline, {
    outputPath,
    videoPath: capture.videoPath,
    resolution: capture.spec.meta.resolution,
    ...(audioPath ? { audioPath } : {}),
    ...(branding ? { branding: renderBranding } : {}),
  });

  if (opts.narration) {
    await writeSubtitles(capture.spec, capture.events, opts.output);
  }

  logger.info(`Output: ${outputPath}`);
}

async function synthesizeAudio(
  spec: DemoSpec,
  events: ActionEvent[],
  opts: GlobalOptions,
): Promise<string | undefined> {
  const { generateScript } = await import("./narration/script-generator.js");
  const { createTTSProvider } = await import("./narration/provider.js");
  const { writeFile, mkdir, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { spawn } = await import("node:child_process");

  const segments = generateScript(spec.chapters, events);
  if (segments.length === 0) {
    logger.info("No narration segments found, skipping TTS");
    return undefined;
  }

  const provider = createTTSProvider(opts.ttsProvider);
  const tmpDir = join(opts.output, ".narration-tmp");
  await mkdir(tmpDir, { recursive: true });

  try {
    const segmentFiles: { path: string; startMs: number }[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      logger.info(
        `Synthesizing segment ${i + 1}/${segments.length}: "${segment.text.slice(0, 40)}..."`,
      );
      const audio = await provider.synthesize(segment.text, {});
      const segPath = join(tmpDir, `seg-${i}.audio`);
      await writeFile(segPath, audio);
      segmentFiles.push({ path: segPath, startMs: segment.startMs });
    }

    const audioPath = join(opts.output, "narration.wav");

    if (segmentFiles.length === 1) {
      // Single segment — just copy it
      const { copyFile } = await import("node:fs/promises");
      await copyFile(segmentFiles[0]!.path, audioPath);
    } else {
      // Multiple segments — use ffmpeg to place each at the right timestamp
      const args = ["-y"];
      for (const seg of segmentFiles) {
        args.push("-i", seg.path);
      }

      const filterParts: string[] = [];
      for (let i = 0; i < segmentFiles.length; i++) {
        const delayMs = Math.max(0, Math.round(segmentFiles[i]!.startMs));
        filterParts.push(`[${i}]adelay=${delayMs}|${delayMs}[a${i}]`);
      }
      const mixInputs = segmentFiles.map((_, i) => `[a${i}]`).join("");
      filterParts.push(
        `${mixInputs}amix=inputs=${segmentFiles.length}:duration=longest:normalize=0`,
      );

      args.push("-filter_complex", filterParts.join(";"));
      args.push(audioPath);

      await new Promise<void>((resolve, reject) => {
        const proc = spawn("ffmpeg", args, { stdio: "pipe" });
        let stderr = "";
        proc.stderr?.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        proc.on("error", (err) => reject(new Error(`Failed to spawn ffmpeg: ${err.message}`)));
        proc.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg audio mix exited ${String(code)}: ${stderr.slice(-500)}`));
        });
      });
    }

    logger.info("Narration synthesized");
    return audioPath;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function writeSubtitles(
  spec: DemoSpec,
  events: ActionEvent[],
  outputDir: string,
): Promise<void> {
  const { generateScript } = await import("./narration/script-generator.js");
  const { generateVTT, generateSRT } = await import("./narration/subtitles.js");
  const { writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const segments = generateScript(spec.chapters, events);
  await writeFile(join(outputDir, "subtitles.vtt"), generateVTT(segments), "utf-8");
  await writeFile(join(outputDir, "subtitles.srt"), generateSRT(segments), "utf-8");
  logger.info("Subtitles saved");
}

async function runEditPipeline(eventsPath: string, opts: GlobalOptions): Promise<void> {
  const { readEventLog } = await import("./capture/event-log.js");
  const { buildTimeline } = await import("./editor/timeline.js");
  const { createRenderer } = await import("./editor/renderer.js");
  const { validateSpec } = await import("./spec/loader.js");
  const { join } = await import("node:path");

  const events = await readEventLog(eventsPath);
  logger.info(`Loaded ${String(events.length)} events`);

  const dummySpec = validateSpec({
    meta: { title: "Demo", resolution: { width: 1920, height: 1080 } },
    runner: { url: "http://localhost:3000" },
    chapters: [{ title: "Content", steps: [{ action: "wait", timeout: 1000 }] }],
  });

  const timeline = buildTimeline(events, dummySpec);
  const renderer = createRenderer(opts.renderer);
  const outputPath = join(opts.output, "output.mp4");

  await renderer.render(timeline, {
    outputPath,
    videoPath: join(opts.output, "video.webm"),
  });

  logger.info(`Output: ${outputPath}`);
}

program.parse();
