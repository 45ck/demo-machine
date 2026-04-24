import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { validateSpec } from "../spec/loader.js";
import type { DemoSpec } from "../spec/types.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("cli:init");

interface InitOptions {
  title?: string | undefined;
  url: string;
  command?: string | undefined;
  force?: boolean | undefined;
}

function buildStarterSpec(opts: InitOptions): DemoSpec {
  const runner = opts.command
    ? { command: opts.command, url: opts.url, timeout: 30000 }
    : { url: opts.url, timeout: 30000 };

  return validateSpec({
    meta: {
      title: opts.title ?? "Product Demo",
      resolution: { width: 1920, height: 1080 },
    },
    runner,
    narration: {
      enabled: true,
      provider: "kokoro",
      sync: { mode: "auto-sync", bufferMs: 500 },
    },
    chapters: [
      {
        title: "First look",
        steps: [
          {
            action: "navigate",
            url: "/",
            narration: "Open the product.",
          },
          {
            action: "wait",
            timeout: 1000,
            narration: "Let the interface settle so the first screen is clear.",
          },
          {
            action: "screenshot",
            name: "first-screen",
            narration: "Capture the first screen as a reference point.",
          },
        ],
      },
    ],
  });
}

export function createStarterSpecYaml(opts: InitOptions): string {
  const spec = buildStarterSpec(opts);
  return stringifyYaml(spec);
}

export async function initSpec(outputPath: string, opts: InitOptions): Promise<void> {
  if (!opts.url) {
    throw new Error("--url is required");
  }

  const specYaml = createStarterSpecYaml(opts);
  const resolved = path.resolve(outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, specYaml, { encoding: "utf8", flag: opts.force ? "w" : "wx" });

  logger.info(`Created ${resolved}`);
  logger.info(`Validate: node dist/cli.js validate ${outputPath}`);
  logger.info(`Capture:  node dist/cli.js capture ${outputPath} --no-edit --no-narration`);
  logger.info(`Render:   node dist/cli.js run ${outputPath}`);
}
