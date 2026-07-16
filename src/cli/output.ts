import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DemoSpec } from "../spec/types.js";
import type { GlobalOptions } from "./options.js";

const DEFAULT_OUTPUT_ROOT = "./output";

type OutputMode = "automatic" | "explicit";

interface OutputResolution {
  outputDir: string;
  outputRoot?: string | undefined;
  mode: OutputMode;
  slug: string;
  runId?: string | undefined;
}

export class OutputCollisionError extends Error {
  readonly outputDir: string;
  readonly artifactNames: string[];

  constructor(outputDir: string, artifactNames: string[]) {
    super(
      `Output directory already contains demo artifacts: ${outputDir}. Use --overwrite to write into it anyway, or choose a different --output path.`,
    );
    this.name = "OutputCollisionError";
    this.outputDir = outputDir;
    this.artifactNames = artifactNames;
  }
}

const KNOWN_ARTIFACT_NAMES = new Set([
  ".narration-tmp",
  "environment.json",
  "events.json",
  "failure.html",
  "failure.json",
  "failure.png",
  "metadata.json",
  "narration",
  "narration-segments.json",
  "narration.wav",
  "output.mp4",
  "quality.json",
  "screenshots",
  "subtitles.srt",
  "subtitles.vtt",
  "trace.zip",
  "verification.json",
  "video.webm",
  "viewer.html",
  "viewer.manifest.json",
]);

function fallbackTitleFromSpecPath(specPath: string | undefined): string {
  if (!specPath) return "demo";
  return path.basename(specPath).replace(/\.demo\.(yaml|yml|json|json5|toml)$/i, "");
}

export function slugifyOutputName(input: string | undefined): string {
  const slug = (input ?? "demo")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "demo";
}

export function createRunId(now = new Date()): string {
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return [
    String(now.getFullYear()),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
    "-",
    pad(now.getMilliseconds(), 3),
  ].join("");
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function findAvailableRunDirectory(
  root: string,
  slug: string,
  runId: string,
): Promise<string> {
  const base = path.join(root, slug, runId);
  if (!(await pathExists(base))) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base}-${String(i)}`;
    if (!(await pathExists(candidate))) return candidate;
  }
  throw new Error(`Could not find an available output directory under ${path.join(root, slug)}`);
}

async function findKnownArtifacts(outputDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(outputDir);
  } catch {
    return [];
  }
  return entries.filter((entry) => KNOWN_ARTIFACT_NAMES.has(entry)).sort();
}

export async function resolveOutputDirectory(params: {
  spec?: Pick<DemoSpec, "meta"> | undefined;
  specPath?: string | undefined;
  requestedOutput?: string | undefined;
  outputWasExplicit: boolean;
  overwrite?: boolean | undefined;
  now?: Date | undefined;
  cwd?: string | undefined;
}): Promise<OutputResolution> {
  const cwd = params.cwd ?? process.cwd();
  const title = params.spec?.meta.title ?? fallbackTitleFromSpecPath(params.specPath);
  const slug = slugifyOutputName(title);
  const requestedOutput = params.requestedOutput ?? DEFAULT_OUTPUT_ROOT;

  if (params.outputWasExplicit) {
    const outputDir = path.resolve(cwd, requestedOutput);
    const artifactNames = params.overwrite ? [] : await findKnownArtifacts(outputDir);
    if (artifactNames.length > 0) {
      throw new OutputCollisionError(outputDir, artifactNames);
    }
    return { outputDir, mode: "explicit", slug };
  }

  const runId = createRunId(params.now);
  const root = path.resolve(cwd, requestedOutput);
  const outputDir = await findAvailableRunDirectory(root, slug, runId);
  return { outputDir, outputRoot: root, mode: "automatic", slug, runId };
}

export async function resolveOutputOptions(params: {
  opts: GlobalOptions;
  spec?: Pick<DemoSpec, "meta"> | undefined;
  specPath?: string | undefined;
  outputWasExplicit: boolean;
  now?: Date | undefined;
}): Promise<{ opts: GlobalOptions; resolution: OutputResolution }> {
  const resolution = await resolveOutputDirectory({
    spec: params.spec,
    specPath: params.specPath,
    requestedOutput: params.opts.output,
    outputWasExplicit: params.outputWasExplicit,
    overwrite: params.opts.overwrite,
    now: params.now,
  });
  return {
    opts: {
      ...params.opts,
      output: resolution.outputDir,
      outputMode: resolution.mode,
      ...(resolution.outputRoot ? { outputRoot: resolution.outputRoot } : {}),
      outputSlug: resolution.slug,
      ...(resolution.runId ? { outputRunId: resolution.runId } : {}),
    },
    resolution,
  };
}

export async function writeLatestOutputPointer(params: {
  outputRoot?: string | undefined;
  mode: "capture" | "run" | "edit";
  title: string;
  outputDir: string;
  specPath?: string | undefined;
  videoPath?: string | undefined;
  renderedVideoPath?: string | undefined;
  eventCount?: number | undefined;
  artifacts?: object | undefined;
}): Promise<string | undefined> {
  if (!params.outputRoot) return undefined;
  const latestPath = path.join(params.outputRoot, "latest.json");
  await mkdir(params.outputRoot, { recursive: true });
  await writeFile(
    latestPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        mode: params.mode,
        title: params.title,
        ...(params.specPath ? { specPath: path.resolve(params.specPath) } : {}),
        outputDir: params.outputDir,
        ...(params.videoPath ? { videoPath: params.videoPath } : {}),
        ...(params.renderedVideoPath ? { renderedVideoPath: params.renderedVideoPath } : {}),
        ...(params.eventCount !== undefined ? { eventCount: params.eventCount } : {}),
        ...(params.artifacts ? { artifacts: params.artifacts } : {}),
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );
  return latestPath;
}
