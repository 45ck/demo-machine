#!/usr/bin/env node
/* eslint-disable @typescript-eslint/unbound-method */

import { Command } from "commander";
import { loadSpec } from "./spec/loader.js";
import type { DemoSpec } from "./spec/types.js";
import type { ActionEvent } from "./playback/types.js";
import type { Timeline } from "./editor/types.js";
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
  .command("format <spec>")
  .description("Convert spec between formats (json, yaml)")
  .option("--to <format>", "Output format: json | yaml", "yaml")
  .option("--out <file>", "Write to file instead of stdout")
  .action(async (specPath: string, cmdOpts: { to: string; out?: string }) => {
    const opts = program.opts<GlobalOptions>();
    applyGlobalOptions(opts);
    try {
      const { serializeSpec } = await import("./spec/loader.js");
      const { writeFile } = await import("node:fs/promises");
      const spec = await loadSpec(specPath);
      const format = cmdOpts.to as import("./spec/loader.js").SerializeFormat;
      if (format !== "json" && format !== "yaml") {
        throw new Error(`Unsupported output format: "${cmdOpts.to}". Supported: json, yaml`);
      }
      const output = serializeSpec(spec, format);
      if (cmdOpts.out) {
        await writeFile(cmdOpts.out, output, "utf-8");
        logger.info(`Written to ${cmdOpts.out}`);
      } else {
        process.stdout.write(output);
      }
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

function extractBranding(
  spec: DemoSpec,
): { logo?: string; colors?: { primary: string; background: string } } | undefined {
  const branding = spec.meta.branding;
  if (!branding) return undefined;
  const result: { logo?: string; colors?: { primary: string; background: string } } = {};
  if (branding.logo) result.logo = branding.logo;
  const colors = branding.colors;
  if (colors?.primary && colors.background) {
    result.colors = { primary: colors.primary, background: colors.background };
  }
  return result;
}

async function prepareNarration(
  capture: CaptureResult,
  timeline: Timeline,
  opts: GlobalOptions,
): Promise<{
  timeline: Timeline;
  audioPath?: string | undefined;
  extendToMs?: number | undefined;
}> {
  if (!opts.narration) return { timeline };

  const { extendTimelineForNarration } = await import("./editor/timeline.js");
  const narrationResult = await synthesizeAudio(capture.spec, capture.events, opts);
  if (!narrationResult) return { timeline };

  const originalDurationMs = timeline.totalDurationMs;
  const extended = extendTimelineForNarration(timeline, narrationResult.totalDurationMs);
  return {
    timeline: extended,
    audioPath: narrationResult.audioPath,
    extendToMs:
      narrationResult.totalDurationMs > originalDurationMs
        ? narrationResult.totalDurationMs
        : undefined,
  };
}

async function runFullPipeline(specPath: string, opts: GlobalOptions): Promise<void> {
  const capture = await captureFromSpec(specPath, opts);

  if (!opts.edit) {
    logger.info(`Capture complete: ${capture.videoPath}`);
    return;
  }

  const { buildTimeline } = await import("./editor/timeline.js");
  const { createRenderer, createRendererV2 } = await import("./editor/renderer.js");
  const { join } = await import("node:path");

  const baseTimeline = buildTimeline(capture.events, capture.spec);
  const outputPath = join(opts.output, "output.mp4");
  const { timeline, audioPath, extendToMs } = await prepareNarration(capture, baseTimeline, opts);
  const branding = extractBranding(capture.spec);

  if (opts.renderer === "remotion") {
    const renderer = await createRendererV2("remotion");
    await renderer.render({
      spec: capture.spec,
      outFile: outputPath,
      tempDir: opts.output,
      assetsDir: opts.output,
    });
  } else {
    const renderer = createRenderer(opts.renderer);
    await renderer.render(timeline, {
      outputPath,
      videoPath: capture.videoPath,
      resolution: capture.spec.meta.resolution,
      ...(audioPath ? { audioPath } : {}),
      ...(extendToMs ? { extendToMs } : {}),
      ...(branding ? { branding } : {}),
    });
  }

  if (opts.narration) {
    await writeSubtitles(capture.spec, capture.events, opts.output);
  }

  logger.info(`Output: ${outputPath}`);
}

async function synthesizeAudio(
  spec: DemoSpec,
  events: ActionEvent[],
  opts: GlobalOptions,
): Promise<import("./narration/types.js").NarrationMixResult | undefined> {
  const { generateScript } = await import("./narration/script-generator.js");
  const { createTTSProvider } = await import("./narration/provider.js");
  const { mixNarrationAudio } = await import("./narration/audio-mixer.js");

  const segments = generateScript(spec.chapters, events);
  const provider = createTTSProvider(opts.ttsProvider);
  return mixNarrationAudio(segments, provider, opts.output);
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

async function registerSubcommands(): Promise<void> {
  const { registerVoicesCommand } = await import("./cli/voices.js");
  registerVoicesCommand(program);
}

registerSubcommands().then(() => program.parse(), console.error);
