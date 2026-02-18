import type { CaptureOptions, CaptureBundle } from "./types.js";
import type { ActionEvent } from "../playback/types.js";
import { writeEventLog } from "./event-log.js";
import type { CaptureMetadata } from "./metadata.js";
import { writeCaptureMetadata } from "./metadata.js";
import { copyFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { createLogger } from "../utils/logger.js";

interface PlaywrightBrowser {
  newContext(options?: Record<string, unknown>): Promise<PlaywrightContext>;
}

interface PlaywrightContext {
  newPage(): Promise<PlaywrightPage>;
  tracing: {
    start(options: { screenshots: boolean; snapshots: boolean }): Promise<void>;
    stop(options: { path: string }): Promise<void>;
  };
  close(): Promise<void>;
}

interface PlaywrightPage {
  video(): PlaywrightVideo | null;
}

interface PlaywrightVideo {
  path(): Promise<string>;
}

const logger = createLogger("capture:recorder");

type FinalizeCaptureOptions = CaptureOptions & { meta?: CaptureMetadata };

async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // ignore
  }
}

async function tryRenameOrCopy(src: string, dest: string): Promise<void> {
  try {
    await rename(src, dest);
    return;
  } catch {
    // rename may fail if locked; fall back to copy+unlink
  }

  await copyFile(src, dest);
  await safeUnlink(src);
}

async function normalizeVideoIfPossible(videoPath: string, outputDir: string): Promise<string> {
  if (!videoPath) return "";

  const outDirResolved = resolve(outputDir) + sep;
  const videoResolved = resolve(videoPath);
  if (!videoResolved.startsWith(outDirResolved)) return videoPath;

  try {
    await stat(videoPath);
  } catch {
    return videoPath;
  }

  const target = join(outputDir, "video.webm");
  if (videoResolved === resolve(target)) return target;

  await safeUnlink(target);
  await tryRenameOrCopy(videoPath, target);
  return target;
}

async function writeMetadataIfProvided(
  meta: CaptureMetadata | undefined,
  outputDir: string,
): Promise<string | undefined> {
  if (!meta) return undefined;
  const metadataPath = join(outputDir, "metadata.json");
  await writeCaptureMetadata(meta, metadataPath);
  return metadataPath;
}

export async function createRecordingContext(
  browser: PlaywrightBrowser,
  options: CaptureOptions,
): Promise<{ context: PlaywrightContext; page: PlaywrightPage }> {
  await mkdir(options.outputDir, { recursive: true });
  logger.info(`Output directory ready: ${options.outputDir}`);

  const context = await browser.newContext({
    recordVideo: {
      dir: options.outputDir,
      size: options.resolution,
    },
  });

  await context.tracing.start({ screenshots: true, snapshots: true });
  logger.info("Tracing started");

  const page = await context.newPage();
  return { context, page };
}

export async function finalizeCapture(
  context: PlaywrightContext,
  page: PlaywrightPage,
  events: ActionEvent[],
  options: FinalizeCaptureOptions,
): Promise<CaptureBundle> {
  const video = page.video();
  const rawVideoPath = video ? await video.path() : "";

  const tracePath = join(options.outputDir, "trace.zip");
  await context.tracing.stop({ path: tracePath });
  logger.info(`Trace saved: ${tracePath}`);

  await context.close();
  logger.info("Context closed, video finalized");

  await mkdir(options.outputDir, { recursive: true });
  const eventLogPath = join(options.outputDir, "events.json");
  await writeEventLog(events, eventLogPath);
  logger.info(`Event log saved: ${eventLogPath}`);

  const normalizedVideoPath = await normalizeVideoIfPossible(rawVideoPath, options.outputDir);
  if (normalizedVideoPath) logger.info(`Video saved: ${normalizedVideoPath}`);

  const metadataPath = await writeMetadataIfProvided(options.meta, options.outputDir);
  if (metadataPath) logger.info(`Metadata saved: ${metadataPath}`);

  return {
    videoPath: normalizedVideoPath,
    tracePath,
    eventLogPath,
    ...(metadataPath ? { metadataPath } : {}),
    screenshots: [],
  };
}
