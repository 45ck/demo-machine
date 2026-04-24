#!/usr/bin/env node
/* eslint-disable @typescript-eslint/unbound-method */

import { Command, InvalidArgumentError } from "commander";
import { loadSpec } from "./spec/loader.js";
import { createLogger } from "./utils/logger.js";
import { applyGlobalOptions, type GlobalOptions } from "./cli/options.js";
import { resolveNarrationSettings } from "./cli/narration.js";
import { captureFromSpec } from "./cli/capture.js";
import { runFullPipeline, runEditPipeline } from "./cli/pipeline.js";
import { runDoctor } from "./cli/doctor.js";
import { initSpec } from "./cli/init.js";
import { formatCliError } from "./cli/error-format.js";
import { getPackageVersion } from "./version.js";

const logger = createLogger("cli");

const program = new Command();

program
  .name("demo-machine")
  .description("Demo as code — automate polished product demo videos from YAML specs")
  .configureHelp({ showGlobalOptions: true })
  .version(getPackageVersion())
  .option("-o, --output <dir>", "Output directory", "./output")
  .option("--no-narration", "Skip narration")
  .option("--no-edit", "For run: skip editing/rendering and keep raw capture only")
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
    (v) => {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n < 0) {
        throw new InvalidArgumentError("--narration-buffer must be a non-negative integer.");
      }
      return n;
    },
    500,
  )
  .option("--verbose", "Verbose logging", false)
  .option("--headless", "Run browser in headless mode", true)
  .option("--no-headless", "Run browser in headed mode")
  .option(
    "--strict-geometry",
    "Fail capture when viewport geometry does not match requested resolution",
    false,
  )
  .option("--from-chapter <title>", "Trim output to start from this chapter title")
  .option("--from-step <index>", "Trim output to start from this step index", (v) => {
    const n = parseInt(v, 10);
    if (!Number.isInteger(n) || n < 0) {
      throw new InvalidArgumentError("--from-step must be a non-negative integer.");
    }
    return n;
  })
  .option(
    "--trim-start-ms <ms>",
    "Additional trim offset in milliseconds",
    (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        throw new InvalidArgumentError("--trim-start-ms must be a non-negative number.");
      }
      return n;
    },
    0,
  )
  .option(
    "--change-detection <mode>",
    "Change detection mode: error | warn | off (overrides spec-level config)",
    (v) => {
      if (v !== "error" && v !== "warn" && v !== "off") {
        throw new InvalidArgumentError("--change-detection must be error, warn, or off.");
      }
      return v;
    },
  )
  .option(
    "--select-approach <A|B|C|D>",
    "Select dropdown visual approach: A (cloned listbox), B (keyboard nav), C (fake overlay, default), D (custom hook)",
    (v) => {
      const upper = v.toUpperCase();
      if (upper !== "A" && upper !== "B" && upper !== "C" && upper !== "D") {
        throw new InvalidArgumentError("--select-approach must be A, B, C, or D.");
      }
      return upper;
    },
  )
  .option("--timeline", "Print narration timeline after rendering", false)
  .option("--resolution <WxH>", "Override spec resolution for capture (e.g. 1280x720)", (v) => {
    const m = /^(\d+)x(\d+)$/.exec(v);
    if (!m) throw new InvalidArgumentError("--resolution must be in WxH format, e.g. 1280x720.");
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (w < 1 || h < 1)
      throw new InvalidArgumentError("--resolution width and height must be positive.");
    return { width: w, height: h };
  });

program
  .command("init <spec>")
  .description("Create a starter demo spec for a local product or web app")
  .requiredOption("--url <url>", "App URL to open, e.g. http://localhost:3000")
  .option("--command <cmd>", "Command to start the app before capture")
  .option("--healthcheck <url>", "Healthcheck URL to wait for before capture")
  .option("--title <title>", "Demo title", "Product Demo")
  .option("--force", "Overwrite the spec file if it already exists", false)
  .action(
    async (
      specPath: string,
      cmdOpts: {
        url: string;
        command?: string;
        healthcheck?: string;
        title?: string;
        force?: boolean;
      },
    ) => {
      const opts = program.opts<GlobalOptions>();
      applyGlobalOptions(opts);
      try {
        await initSpec(specPath, cmdOpts);
      } catch (err) {
        logger.error(formatCliError(err, { verbose: opts.verbose }));
        process.exitCode = 1;
      }
    },
  );

program
  .command("validate <spec>")
  .description("Validate a demo spec file")
  .action(async (specPath: string) => {
    const opts = program.opts<GlobalOptions>();
    applyGlobalOptions(opts);
    try {
      const spec = await loadSpec(specPath);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { resolveNarrationSettings: resolveNarrSettings } = await import("./cli/narration.js");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const settings = resolveNarrSettings({
        spec,
        opts,
        getOptionSource: (name: string) => program.getOptionValueSource(name),
      });
      const pathMod = await import("node:path");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { preflight: preflightCheck } = await import("./validation/preflight.js");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await preflightCheck({
        spec,
        specPath,
        specDir: pathMod.dirname(pathMod.resolve(specPath)),
        opts,
        settings,
      });
      logger.info(`Spec valid: "${spec.meta.title}" (${String(spec.chapters.length)} chapters)`);
    } catch (err) {
      logger.error(formatCliError(err, { verbose: opts.verbose }));
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
      logger.error(formatCliError(err, { verbose: opts.verbose }));
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
      logger.error(formatCliError(err, { verbose: opts.verbose }));
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
      logger.error(formatCliError(err, { verbose: opts.verbose }));
      process.exitCode = 1;
    }
  });

program
  .command("edit <events>")
  .description("Edit from existing event log + raw video")
  .option("--spec <path>", "Original spec file — enables narration without re-capturing")
  .action(async (eventsPath: string, cmdOpts: { spec?: string }) => {
    const opts = program.opts<GlobalOptions>();
    applyGlobalOptions(opts);
    try {
      await runEditPipeline(eventsPath, opts, cmdOpts.spec);
    } catch (err) {
      logger.error(formatCliError(err, { verbose: opts.verbose }));
      process.exitCode = 1;
    }
  });

async function registerSubcommands(): Promise<void> {
  const { registerExamplesCommand } = await import("./cli/examples.js");
  const { registerVoicesCommand } = await import("./cli/voices.js");
  registerExamplesCommand(program);
  registerVoicesCommand(program);
}

registerSubcommands().then(() => program.parse(), console.error);
