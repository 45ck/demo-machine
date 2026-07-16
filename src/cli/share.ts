import path from "node:path";
import type { Command } from "commander";
import { readCaptureMetadataMaybe } from "../capture/metadata.js";
import { readEventLog } from "../capture/event-log.js";
import { probeVideo } from "../quality/ffprobe.js";
import { generateShareViewer } from "../share/generator.js";
import { loadSpec } from "../spec/loader.js";
import { createLogger } from "../utils/logger.js";
import { formatCliError } from "./error-format.js";
import { applyGlobalOptions, type GlobalOptions } from "./options.js";

const logger = createLogger("cli:share");

export async function generateShareViewerFromOutput(params: {
  specPath: string;
  outputDir: string;
}): Promise<Awaited<ReturnType<typeof generateShareViewer>>> {
  const spec = await loadSpec(params.specPath);
  if (!spec.share) {
    throw new Error("Demo spec is missing the required share configuration");
  }
  const outputDir = path.resolve(params.outputDir);
  const events = await readEventLog(path.join(outputDir, "events.json"));
  if (events.length === 0)
    throw new Error("Cannot generate a share viewer from an empty event log");
  const metadata = await readCaptureMetadataMaybe(path.join(outputDir, "metadata.json"));
  const startTimestamp = metadata?.startTimestamp ?? events[0]!.timestamp;
  const probe = await probeVideo(path.join(outputDir, spec.share.video));
  return generateShareViewer({
    outputDir,
    config: spec.share,
    spec,
    events,
    startTimestamp,
    durationMs: Math.round(probe.videoDurationSec * 1_000),
  });
}

export function registerShareCommand(program: Command): void {
  program
    .command("share <spec> <outputDir>")
    .description("Generate a private-by-default static viewer beside a completed demo")
    .action(async (specPath: string, outputDir: string) => {
      const opts = program.opts<GlobalOptions>();
      applyGlobalOptions(opts);
      try {
        const result = await generateShareViewerFromOutput({ specPath, outputDir });
        logger.info(`Viewer: ${result.viewerPath}`);
        logger.info(`Viewer manifest: ${result.manifestPath}`);
      } catch (error) {
        logger.error(formatCliError(error, { verbose: opts.verbose }));
        process.exitCode = 1;
      }
    });
}
