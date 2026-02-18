#!/usr/bin/env node
/* eslint-disable @typescript-eslint/unbound-method */

import { Command } from "commander";
import { loadSpec } from "./spec/loader.js";
import { createLogger } from "./utils/logger.js";
import { applyGlobalOptions, type GlobalOptions } from "./cli/options.js";
import { resolveNarrationSettings } from "./cli/narration.js";
import { captureFromSpec } from "./cli/capture.js";
import { runFullPipeline, runEditPipeline } from "./cli/pipeline.js";
import { runDoctor } from "./cli/doctor.js";

const logger = createLogger("cli");

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
  .option(
    "--tts-voice <id>",
    "TTS voice id (provider-specific). Example: kokoro=af_heart openai=alloy elevenlabs=Rachel",
  )
  .option(
    "--narration-sync <mode>",
    "Narration sync mode: manual | auto-sync | warn-only",
    "manual",
  )
  .option(
    "--narration-buffer <ms>",
    "Lead-in buffer between narration end and action (ms). Used by auto-sync and subtitles",
    (v) => parseInt(v, 10),
    500,
  )
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
      logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
      process.exitCode = 1;
    }
  });

program
  .command("doctor")
  .description("Check local environment dependencies (playwright, ffmpeg, disk space, TTS)")
  .action(async () => {
    const opts = program.opts<GlobalOptions>();
    applyGlobalOptions(opts);
    const ok = await runDoctor(opts);
    if (!ok) process.exitCode = 1;
  });

program
  .command("capture <spec>")
  .description("Run app + capture raw video (no editing)")
  .action(async (specPath: string) => {
    const opts = program.opts<GlobalOptions>();
    applyGlobalOptions(opts);
    try {
      const spec = await loadSpec(specPath);
      const settings = resolveNarrationSettings({
        spec,
        opts,
        getOptionSource: (name) => program.getOptionValueSource(name),
      });
      const bundle = await captureFromSpec({ spec, specPath, opts, settings });
      logger.info(`Capture complete: ${bundle.videoPath}`);
    } catch (err) {
      logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
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
      const spec = await loadSpec(specPath);
      const settings = resolveNarrationSettings({
        spec,
        opts,
        getOptionSource: (name) => program.getOptionValueSource(name),
      });
      await runFullPipeline({ spec, specPath, opts, settings });
    } catch (err) {
      logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
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
      logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
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
      logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
      process.exitCode = 1;
    }
  });

async function registerSubcommands(): Promise<void> {
  const { registerVoicesCommand } = await import("./cli/voices.js");
  registerVoicesCommand(program);
}

registerSubcommands().then(() => program.parse(), console.error);
