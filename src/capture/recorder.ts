import type { CaptureOptions, CaptureBundle } from "./types.js";
import type { ActionEvent } from "../playback/types.js";
import { writeEventLog } from "./event-log.js";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
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
  options: CaptureOptions,
): Promise<CaptureBundle> {
  const video = page.video();
  const videoPath = video ? await video.path() : "";

  const tracePath = join(options.outputDir, "trace.zip");
  await context.tracing.stop({ path: tracePath });
  logger.info(`Trace saved: ${tracePath}`);

  await context.close();
  logger.info("Context closed, video finalized");

  await mkdir(options.outputDir, { recursive: true });
  const eventLogPath = join(options.outputDir, "events.json");
  await writeEventLog(events, eventLogPath);
  logger.info(`Event log saved: ${eventLogPath}`);

  return {
    videoPath,
    tracePath,
    eventLogPath,
    screenshots: [],
  };
}
