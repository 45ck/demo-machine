import type { DemoSpec } from "../spec/types.js";
import { createLogger } from "../utils/logger.js";
import type { GlobalOptions } from "./options.js";
import type { NarrationSettings } from "./narration.js";
import { captureFromSpec } from "./capture.js";
import { prepareNarration, writeSubtitlesFromTimed } from "./narration.js";

const log = createLogger("cli:pipeline");

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

async function prepareTrimmedCapture(params: {
  capture: Awaited<ReturnType<typeof captureFromSpec>>;
  opts: GlobalOptions;
}): Promise<{
  workingCapture: Awaited<ReturnType<typeof captureFromSpec>>;
  trim: Awaited<ReturnType<typeof import("../editor/trim.js").applyTimelineTrim>>;
}> {
  const trimMod = await import("../editor/trim.js");
  const trim = trimMod.applyTimelineTrim({
    events: params.capture.events,
    spec: params.capture.spec,
    startTimestamp: params.capture.startTimestamp,
    fromChapter: params.opts.fromChapter,
    fromStep: params.opts.fromStep,
    trimStartMs: params.opts.trimStartMs,
  });
  if (trim.videoTrimStartMs > 0) {
    log.info(
      `Applying trim start at ${String(trim.videoTrimStartMs)}ms (event index ${String(trim.startEventIndex)})`,
    );
  }

  return {
    trim,
    workingCapture: {
      ...params.capture,
      events: trim.events,
      spec: trim.spec,
      startTimestamp: trim.timelineStartTimestamp,
    },
  };
}

async function renderFromTimeline(params: {
  workingCapture: Awaited<ReturnType<typeof captureFromSpec>>;
  narrationPrep: Awaited<ReturnType<typeof prepareNarration>>;
  trimStartMs: number;
  renderer: GlobalOptions["renderer"];
  outputDir: string;
}): Promise<string> {
  const rendererMod = await import("../editor/renderer.js");
  const pathMod = await import("node:path");
  const outputPath = pathMod.join(params.outputDir, "output.mp4");
  const branding = extractBranding(params.workingCapture.spec);

  if (params.renderer === "remotion") {
    if (params.trimStartMs > 0) {
      throw new Error(
        "Timeline trimming (--from-chapter/--from-step/--trim-start-ms) is not supported with the remotion renderer",
      );
    }
    const remotionRenderer = await rendererMod.createRendererV2("remotion");
    await remotionRenderer.render({
      spec: params.workingCapture.spec,
      outFile: outputPath,
      tempDir: params.outputDir,
      assetsDir: params.outputDir,
    });
    return outputPath;
  }

  const ffmpegRenderer = rendererMod.createRenderer(params.renderer);
  await ffmpegRenderer.render(params.narrationPrep.timeline, {
    outputPath,
    videoPath: params.workingCapture.videoPath,
    trimStartMs: params.trimStartMs,
    resolution: params.workingCapture.spec.meta.resolution,
    ...(params.narrationPrep.audioPath ? { audioPath: params.narrationPrep.audioPath } : {}),
    ...(params.narrationPrep.extendToMs ? { extendToMs: params.narrationPrep.extendToMs } : {}),
    ...(branding ? { branding } : {}),
  });
  return outputPath;
}

export async function runFullPipeline(params: {
  spec: DemoSpec;
  specPath?: string;
  opts: GlobalOptions;
  settings: NarrationSettings;
}): Promise<void> {
  const capture = await captureFromSpec({
    spec: params.spec,
    ...(params.specPath ? { specPath: params.specPath } : {}),
    opts: params.opts,
    settings: params.settings,
  });

  if (!params.opts.edit) {
    log.info(`Capture complete: ${capture.videoPath}`);
    return;
  }

  const timelineMod = await import("../editor/timeline.js");
  const { workingCapture, trim } = await prepareTrimmedCapture({ capture, opts: params.opts });

  const baseTimeline = timelineMod.buildTimeline(
    workingCapture.events,
    workingCapture.spec,
    workingCapture.startTimestamp,
  );

  const narrationPrep = await prepareNarration({
    capture: workingCapture,
    timeline: baseTimeline,
    opts: params.opts,
    settings: params.settings,
  });

  const outputPath = await renderFromTimeline({
    workingCapture,
    narrationPrep,
    trimStartMs: trim.videoTrimStartMs,
    renderer: params.opts.renderer,
    outputDir: params.opts.output,
  });

  if (params.opts.narration && narrationPrep.timedSegments) {
    await writeSubtitlesFromTimed({
      segments: narrationPrep.timedSegments,
      outputDir: params.opts.output,
    });
  }

  log.info(`Output: ${outputPath}`);
}

export async function runEditPipeline(eventsPath: string, opts: GlobalOptions): Promise<void> {
  if (opts.fromChapter) {
    throw new Error(
      "--from-chapter is not supported with the 'edit' command (no spec chapters available). Use --from-step or --trim-start-ms instead.",
    );
  }

  const eventLogMod = await import("../capture/event-log.js");
  const captureMetaMod = await import("../capture/metadata.js");
  const timelineMod = await import("../editor/timeline.js");
  const rendererMod = await import("../editor/renderer.js");
  const specMod = await import("../spec/loader.js");
  const pathMod = await import("node:path");

  const events = await eventLogMod.readEventLog(eventsPath);
  log.info(`Loaded ${String(events.length)} events`);

  if (events.length === 0) {
    throw new Error(`No events found in ${eventsPath}. Cannot render an empty capture.`);
  }

  const assetsDir = pathMod.dirname(eventsPath);
  const meta = await captureMetaMod.readCaptureMetadataMaybe(
    pathMod.join(assetsDir, "metadata.json"),
  );
  const t0 = meta?.startTimestamp;
  if (t0) log.info(`Using capture startTimestamp: ${String(t0)}`);

  const dummySpec = specMod.validateSpec({
    meta: { title: "Demo", resolution: { width: 1920, height: 1080 } },
    runner: { url: "http://localhost:3000" },
    chapters: [
      {
        title: "Content",
        steps: events.map(() => ({ action: "wait" as const, timeout: 1000 })),
      },
    ],
  });

  const trimMod = await import("../editor/trim.js");
  const trim = trimMod.applyTimelineTrim({
    events,
    spec: dummySpec,
    startTimestamp: t0 ?? events[0]?.timestamp ?? 0,
    fromStep: opts.fromStep,
    trimStartMs: opts.trimStartMs,
  });
  if (trim.videoTrimStartMs > 0) {
    log.info(
      `Applying trim start at ${String(trim.videoTrimStartMs)}ms (event index ${String(trim.startEventIndex)})`,
    );
  }

  const timeline = timelineMod.buildTimeline(trim.events, trim.spec, trim.timelineStartTimestamp);
  const renderer = rendererMod.createRenderer(opts.renderer);
  const outputPath = pathMod.join(opts.output, "output.mp4");

  const videoPath = pathMod.join(assetsDir, "video.webm");
  try {
    await (await import("node:fs/promises")).access(videoPath);
  } catch {
    throw new Error(`video file not found: ${videoPath}`);
  }

  const fsMod = await import("node:fs/promises");
  await fsMod.mkdir(opts.output, { recursive: true });

  await renderer.render(timeline, {
    outputPath,
    videoPath,
    trimStartMs: trim.videoTrimStartMs,
  });

  log.info(`Output: ${outputPath}`);
}
