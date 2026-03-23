import { createLogger } from "../utils/logger.js";
import type { GlobalOptions } from "./options.js";
import {
  prepareNarration,
  resolveNarrationSettings,
  writeSubtitlesFromTimed,
} from "./narration.js";
import { displayTimelineAndSaveSegments } from "./timeline-display.js";

const log = createLogger("cli:pipeline");

type EditCapture = {
  events: Awaited<ReturnType<typeof import("../capture/event-log.js").readEventLog>>;
  startTimestamp: number;
  assetsDir: string;
  trim: Awaited<ReturnType<typeof import("../editor/trim.js").applyTimelineTrim>>;
};

async function loadAndTrimEditCapture(
  eventsPath: string,
  opts: GlobalOptions,
): Promise<EditCapture> {
  const [eventLogMod, captureMetaMod, specMod, trimMod, pathMod] = await Promise.all([
    import("../capture/event-log.js"),
    import("../capture/metadata.js"),
    import("../spec/loader.js"),
    import("../editor/trim.js"),
    import("node:path"),
  ]);

  const events = await eventLogMod.readEventLog(eventsPath);
  log.info(`Loaded ${String(events.length)} events`);
  if (events.length === 0) {
    throw new Error(`No events found in ${eventsPath}. Cannot render an empty capture.`);
  }

  const assetsDir = pathMod.dirname(eventsPath);
  const meta = await captureMetaMod.readCaptureMetadataMaybe(
    pathMod.join(assetsDir, "metadata.json"),
  );
  const startTimestamp = meta?.startTimestamp ?? events[0]?.timestamp ?? 0;
  if (meta?.startTimestamp) log.info(`Using capture startTimestamp: ${String(startTimestamp)}`);

  const dummySpec = specMod.validateSpec({
    meta: { title: "Demo", resolution: { width: 1920, height: 1080 } },
    runner: { url: "http://localhost:3000" },
    chapters: [
      { title: "Content", steps: events.map(() => ({ action: "wait" as const, timeout: 1000 })) },
    ],
  });
  const trim = trimMod.applyTimelineTrim({
    events,
    spec: dummySpec,
    startTimestamp,
    fromStep: opts.fromStep,
    trimStartMs: opts.trimStartMs,
  });
  if (trim.videoTrimStartMs > 0) {
    log.info(
      `Applying trim start at ${String(trim.videoTrimStartMs)}ms (event index ${String(trim.startEventIndex)})`,
    );
  }
  return { events, startTimestamp, assetsDir, trim };
}

async function renderEditNarrated(params: {
  specPath: string;
  events: EditCapture["events"];
  startTimestamp: number;
  timeline: Awaited<ReturnType<typeof import("../editor/timeline.js").buildTimeline>>;
  renderer: ReturnType<typeof import("../editor/renderer.js").createRenderer>;
  opts: GlobalOptions;
  videoPath: string;
  outputPath: string;
  trimStartMs: number;
}): Promise<boolean> {
  const { loadSpec } = await import("../spec/loader.js");
  const realSpec = await loadSpec(params.specPath);
  const narrationSettings = resolveNarrationSettings({
    spec: realSpec,
    opts: params.opts,
    getOptionSource: () => undefined,
  });
  if (!narrationSettings.enabled) return false;

  const narrationPrep = await prepareNarration({
    capture: { spec: realSpec, events: params.events, startTimestamp: params.startTimestamp },
    timeline: params.timeline,
    opts: params.opts,
    settings: narrationSettings,
  });
  await params.renderer.render(params.timeline, {
    outputPath: params.outputPath,
    videoPath: params.videoPath,
    trimStartMs: params.trimStartMs,
    ...(narrationPrep.audioPath ? { audioPath: narrationPrep.audioPath } : {}),
    ...(narrationPrep.extendToMs ? { extendToMs: narrationPrep.extendToMs } : {}),
  });
  if (narrationPrep.timedSegments) {
    displayTimelineAndSaveSegments({
      timedSegments: narrationPrep.timedSegments,
      events: params.events,
      startTimestamp: params.startTimestamp,
      spec: realSpec,
      totalDurationMs: params.timeline.totalDurationMs,
      outputDir: params.opts.output,
      showTimeline: params.opts.timeline,
    });
    await writeSubtitlesFromTimed({
      segments: narrationPrep.timedSegments,
      outputDir: params.opts.output,
    });
  }
  return true;
}

export async function runEditPipeline(
  eventsPath: string,
  opts: GlobalOptions,
  specPath?: string,
): Promise<void> {
  if (opts.fromChapter) {
    throw new Error(
      "--from-chapter is not supported with the 'edit' command (no spec chapters available). Use --from-step or --trim-start-ms instead.",
    );
  }

  const [timelineMod, rendererMod, pathMod, fsMod] = await Promise.all([
    import("../editor/timeline.js"),
    import("../editor/renderer.js"),
    import("node:path"),
    import("node:fs/promises"),
  ]);

  const { events, startTimestamp, assetsDir, trim } = await loadAndTrimEditCapture(
    eventsPath,
    opts,
  );
  const timeline = timelineMod.buildTimeline(trim.events, trim.spec, trim.timelineStartTimestamp);
  const renderer = rendererMod.createRenderer(opts.renderer);
  const outputPath = pathMod.join(opts.output, "output.mp4");
  const videoPath = pathMod.join(assetsDir, "video.webm");

  try {
    await fsMod.access(videoPath);
  } catch {
    throw new Error(`video file not found: ${videoPath}`);
  }
  await fsMod.mkdir(opts.output, { recursive: true });

  if (specPath && opts.narration) {
    const rendered = await renderEditNarrated({
      specPath,
      events,
      startTimestamp,
      timeline,
      renderer,
      opts,
      videoPath,
      outputPath,
      trimStartMs: trim.videoTrimStartMs,
    });
    if (rendered) {
      log.info(`Output: ${outputPath}`);
      return;
    }
  }

  await renderer.render(timeline, { outputPath, videoPath, trimStartMs: trim.videoTrimStartMs });
  log.info(`Output: ${outputPath}`);
}
