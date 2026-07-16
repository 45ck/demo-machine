import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_STDERR = 4_096;
const POSTER_PROVENANCE_VERSION = 2;

interface GeneratedPosterProvenance {
  schemaVersion: typeof POSTER_PROVENANCE_VERSION;
  kind: "demo-machine-generated-poster";
  sourceVideoSha256: string;
  posterSha256: string;
  sourceDurationMs: number;
  seekMs: number;
}

export type PosterCommandRunner = (command: string, args: readonly string[]) => Promise<void>;

export function buildPosterArgs(params: {
  videoPath: string;
  posterPath: string;
  durationMs: number;
  seekMs?: number | undefined;
}): string[] {
  if (!Number.isFinite(params.durationMs) || params.durationMs < 1) {
    throw new Error("Poster source duration must be a positive finite value");
  }
  const seekMs = params.seekMs ?? Math.max(0, Math.floor(params.durationMs / 2));
  if (!Number.isFinite(seekMs) || seekMs < 0 || seekMs >= params.durationMs) {
    throw new Error("Poster seek must be finite, non-negative, and below the source duration");
  }
  return [
    "-y",
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    (seekMs / 1_000).toFixed(3),
    "-i",
    params.videoPath,
    "-map",
    "0:v:0",
    "-frames:v",
    "1",
    "-vf",
    "scale=1280:-2:flags=lanczos",
    "-an",
    "-map_metadata",
    "-1",
    "-fflags",
    "+bitexact",
    "-flags:v",
    "+bitexact",
    "-c:v",
    "png",
    "-pix_fmt",
    "rgb24",
    "-threads",
    "1",
    "-f",
    "image2",
    "-update",
    "1",
    params.posterPath,
  ];
}

const runPosterCommand: PosterCommandRunner = async (command, args) => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > MAX_STDERR) stderr = stderr.slice(-MAX_STDERR);
    });
    child.on("error", (error) => reject(new Error(`Failed to spawn ffmpeg: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`ffmpeg poster extraction exited with code ${String(code)}: ${stderr}`));
    });
  });
};

async function regularFileState(filePath: string): Promise<"missing" | "regular" | "unsafe"> {
  try {
    const file = await lstat(filePath);
    return file.isFile() && !file.isSymbolicLink() && file.size > 0 ? "regular" : "unsafe";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw error;
  }
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

const provenancePathFor = (posterPath: string): string =>
  path.join(path.dirname(posterPath), `.${path.basename(posterPath)}.demo-machine-source.json`);

function parseGeneratedProvenance(value: string): GeneratedPosterProvenance {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new Error("Poster provenance is not valid JSON");
  }
  const sourceDurationMs = Number(parsed["sourceDurationMs"]);
  const seekMs = Number(parsed["seekMs"]);
  const valid = [
    parsed["schemaVersion"] === POSTER_PROVENANCE_VERSION,
    parsed["kind"] === "demo-machine-generated-poster",
    typeof parsed["sourceVideoSha256"] === "string",
    typeof parsed["posterSha256"] === "string",
    /^[a-f0-9]{64}$/.test(String(parsed["sourceVideoSha256"])),
    /^[a-f0-9]{64}$/.test(String(parsed["posterSha256"])),
    Number.isSafeInteger(sourceDurationMs),
    sourceDurationMs >= 1,
    Number.isSafeInteger(seekMs),
    seekMs >= 0,
    seekMs < sourceDurationMs,
  ].every(Boolean);
  if (!valid) {
    throw new Error("Poster provenance is invalid or from an unsupported schema version");
  }
  return parsed as unknown as GeneratedPosterProvenance;
}

async function readGeneratedProvenance(
  provenancePath: string,
): Promise<GeneratedPosterProvenance | undefined> {
  const state = await regularFileState(provenancePath);
  if (state === "missing") return undefined;
  if (state === "unsafe") {
    throw new Error(
      `Poster provenance must be a regular sibling file: ${path.basename(provenancePath)}`,
    );
  }
  return parseGeneratedProvenance(await readFile(provenancePath, "utf8"));
}

interface PosterGenerationPlan {
  preserve: boolean;
  sourceVideoSha256: string | undefined;
  replacePosterSha256: string | undefined;
}

async function planPosterGeneration(
  videoPath: string,
  posterPath: string,
  provenancePath: string,
  durationMs: number,
): Promise<PosterGenerationPlan> {
  const existingState = await regularFileState(posterPath);
  if (existingState === "unsafe") {
    throw new Error(`Poster must be a regular sibling file: ${path.basename(posterPath)}`);
  }
  if (existingState === "missing") {
    return { preserve: false, sourceVideoSha256: undefined, replacePosterSha256: undefined };
  }

  const provenance = await readGeneratedProvenance(provenancePath);
  if (!provenance) {
    return { preserve: true, sourceVideoSha256: undefined, replacePosterSha256: undefined };
  }
  const posterSha256 = await hashFile(posterPath);
  if (posterSha256 !== provenance.posterSha256) {
    return { preserve: true, sourceVideoSha256: undefined, replacePosterSha256: undefined };
  }
  const sourceVideoSha256 = await hashFile(videoPath);
  return {
    preserve:
      sourceVideoSha256 === provenance.sourceVideoSha256 &&
      provenance.sourceDurationMs === Math.round(durationMs),
    sourceVideoSha256,
    replacePosterSha256: posterSha256,
  };
}

async function assertGenerationPaths(posterPath: string, provenancePath: string): Promise<void> {
  if (path.extname(posterPath).toLowerCase() !== ".png") {
    throw new Error(
      `Poster not found beside the viewer output: ${path.basename(posterPath)}. ` +
        "Automatic poster generation requires a .png filename.",
    );
  }
  if ((await regularFileState(provenancePath)) === "unsafe") {
    throw new Error(
      `Poster provenance must be a regular sibling file: ${path.basename(provenancePath)}`,
    );
  }
}

async function extractPoster(params: {
  videoPath: string;
  temporaryPath: string;
  durationMs: number;
  commandRunner: PosterCommandRunner;
}): Promise<number> {
  const defaultSeekMs = Math.max(0, Math.floor(params.durationMs / 2));
  await params.commandRunner(
    "ffmpeg",
    buildPosterArgs({
      videoPath: params.videoPath,
      posterPath: params.temporaryPath,
      durationMs: params.durationMs,
    }),
  );
  if ((await regularFileState(params.temporaryPath)) === "regular") return defaultSeekMs;

  if (defaultSeekMs > 0) {
    await params.commandRunner(
      "ffmpeg",
      buildPosterArgs({
        videoPath: params.videoPath,
        posterPath: params.temporaryPath,
        durationMs: params.durationMs,
        seekMs: 0,
      }),
    );
  }
  if ((await regularFileState(params.temporaryPath)) !== "regular") {
    throw new Error("ffmpeg did not produce a regular PNG poster");
  }
  return 0;
}

async function assertPosterDestination(
  posterPath: string,
  replacePosterSha256: string | undefined,
): Promise<void> {
  const destinationState = await regularFileState(posterPath);
  const unchangedReplacement =
    replacePosterSha256 !== undefined &&
    destinationState === "regular" &&
    (await hashFile(posterPath)) === replacePosterSha256;
  if (destinationState === "missing" || unchangedReplacement) return;
  throw new Error(`Poster destination changed during generation: ${path.basename(posterPath)}`);
}

async function writeTemporaryProvenance(params: {
  temporaryPath: string;
  sourceVideoSha256: string;
  posterSha256: string;
  sourceDurationMs: number;
  seekMs: number;
}): Promise<void> {
  const provenance: GeneratedPosterProvenance = {
    schemaVersion: POSTER_PROVENANCE_VERSION,
    kind: "demo-machine-generated-poster",
    sourceVideoSha256: params.sourceVideoSha256,
    posterSha256: params.posterSha256,
    sourceDurationMs: Math.round(params.sourceDurationMs),
    seekMs: Math.round(params.seekMs),
  };
  await writeFile(params.temporaryPath, `${JSON.stringify(provenance, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

export async function ensurePosterAsset(params: {
  videoPath: string;
  posterPath: string;
  durationMs: number;
  commandRunner?: PosterCommandRunner | undefined;
}): Promise<string> {
  const provenancePath = provenancePathFor(params.posterPath);
  const plan = await planPosterGeneration(
    params.videoPath,
    params.posterPath,
    provenancePath,
    params.durationMs,
  );
  if (plan.preserve) return params.posterPath;
  await assertGenerationPaths(params.posterPath, provenancePath);

  const temporaryPath = path.join(
    path.dirname(params.posterPath),
    `.${path.basename(params.posterPath)}.demo-machine-${process.pid}-${randomUUID()}.tmp.png`,
  );
  const temporaryProvenancePath = `${temporaryPath}.json`;
  try {
    const seekMs = await extractPoster({
      videoPath: params.videoPath,
      temporaryPath,
      durationMs: params.durationMs,
      commandRunner: params.commandRunner ?? runPosterCommand,
    });
    await assertPosterDestination(params.posterPath, plan.replacePosterSha256);
    await writeTemporaryProvenance({
      temporaryPath: temporaryProvenancePath,
      sourceVideoSha256: plan.sourceVideoSha256 ?? (await hashFile(params.videoPath)),
      posterSha256: await hashFile(temporaryPath),
      sourceDurationMs: params.durationMs,
      seekMs,
    });
    await rename(temporaryPath, params.posterPath);
    await rename(temporaryProvenancePath, provenancePath);
    return params.posterPath;
  } finally {
    await rm(temporaryPath, { force: true });
    await rm(temporaryProvenancePath, { force: true });
  }
}
