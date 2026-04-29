import type { Command } from "commander";
import { formatCliError } from "./error-format.js";
import { applyGlobalOptions, type GlobalOptions } from "./options.js";
import { createLogger } from "../utils/logger.js";
import type { AnalyzeDemoRunResult } from "../quality/video-evaluator-adapter.js";

const logger = createLogger("cli:analyze");

interface AnalyzeCommandOptions {
  latest?: boolean;
  spec?: string;
  video?: string;
  layout?: string;
  ocr?: boolean;
}

function validateAnalyzeInput(outputDir: string | undefined, cmdOpts: AnalyzeCommandOptions): void {
  if (outputDir && cmdOpts.latest) {
    throw new Error("Pass either an output directory or --latest, not both.");
  }
  if (!outputDir && !cmdOpts.latest && !cmdOpts.video) {
    throw new Error("Analyze requires an output directory, --latest, or --video.");
  }
}

function formatAnalyzeSummary(result: AnalyzeDemoRunResult): string {
  const artifactLines = Object.entries(result.artifacts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, path]) => `- ${name}: ${path}`)
    .join("\n");
  return [
    "Analyzer artifacts generated",
    `- Output dir: ${result.outputDir}`,
    `- Video: ${result.videoPath}`,
    artifactLines,
  ].join("\n");
}

export function registerAnalyzeCommand(program: Command): void {
  program
    .command("analyze [outputDir]")
    .description("Generate video-evaluator artifacts for an existing demo run")
    .option("--latest", "Analyze the latest run under the global --output root", false)
    .option("--spec <path>", "Original spec file to include in the review prompt")
    .option(
      "--video <path>",
      "Video file to analyze instead of auto-detecting output.mp4/video.webm",
    )
    .option("--layout <path>", "Layout annotation JSON for layout-safety review")
    .option("--no-ocr", "Skip OCR-backed analyzer steps")
    .action(async (outputDir: string | undefined, cmdOpts: AnalyzeCommandOptions) => {
      const opts = program.opts<GlobalOptions>();
      applyGlobalOptions(opts);
      try {
        validateAnalyzeInput(outputDir, cmdOpts);
        const { analyzeDemoRun } = await import("../quality/video-evaluator-adapter.js");
        const result = await analyzeDemoRun({
          ...(outputDir ? { outputDir } : {}),
          ...(cmdOpts.latest ? { latestPointerRoot: opts.output } : {}),
          ...(cmdOpts.video ? { videoPath: cmdOpts.video } : {}),
          ...(cmdOpts.spec ? { specPath: cmdOpts.spec } : {}),
          ...(cmdOpts.layout ? { layoutPath: cmdOpts.layout } : {}),
          runOcr: cmdOpts.ocr ?? true,
        });
        logger.info(formatAnalyzeSummary(result));
      } catch (err) {
        logger.error(formatCliError(err, { verbose: opts.verbose }));
        process.exitCode = 1;
      }
    });
}
