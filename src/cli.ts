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
  .option("--tts-provider <name>", "TTS: openai | elevenlabs | piper", "openai")
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
): Promise<string> {
  const { generateScript } = await import("./narration/script-generator.js");
  const { createTTSProvider } = await import("./narration/provider.js");
  const { writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const segments = generateScript(spec.chapters, events);
  const provider = createTTSProvider(opts.ttsProvider);
  const audioChunks: Buffer[] = [];

  for (const segment of segments) {
    const audio = await provider.synthesize(segment.text, {});
    audioChunks.push(audio);
  }

  const audioPath = join(opts.output, "narration.wav");
  await writeFile(audioPath, Buffer.concat(audioChunks));
  logger.info("Narration synthesized");
  return audioPath;
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
