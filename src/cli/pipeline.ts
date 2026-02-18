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
  const rendererMod = await import("../editor/renderer.js");
  const pathMod = await import("node:path");

  const baseTimeline = timelineMod.buildTimeline(
    capture.events,
    capture.spec,
    capture.startTimestamp,
  );
  const outputPath = pathMod.join(params.opts.output, "output.mp4");

  const narrationPrep = await prepareNarration({
    capture,
    timeline: baseTimeline,
    opts: params.opts,
    settings: params.settings,
  });

  const branding = extractBranding(capture.spec);

  if (params.opts.renderer === "remotion") {
    const renderer = await rendererMod.createRendererV2("remotion");
    await renderer.render({
      spec: capture.spec,
      outFile: outputPath,
      tempDir: params.opts.output,
      assetsDir: params.opts.output,
    });
  } else {
    const renderer = rendererMod.createRenderer(params.opts.renderer);
    await renderer.render(narrationPrep.timeline, {
      outputPath,
      videoPath: capture.videoPath,
      resolution: capture.spec.meta.resolution,
      ...(narrationPrep.audioPath ? { audioPath: narrationPrep.audioPath } : {}),
      ...(narrationPrep.extendToMs ? { extendToMs: narrationPrep.extendToMs } : {}),
      ...(branding ? { branding } : {}),
    });
  }

  if (params.opts.narration && narrationPrep.timedSegments) {
    await writeSubtitlesFromTimed({
      segments: narrationPrep.timedSegments,
      outputDir: params.opts.output,
    });
  }

  log.info(`Output: ${outputPath}`);
}

export async function runEditPipeline(eventsPath: string, opts: GlobalOptions): Promise<void> {
  const eventLogMod = await import("../capture/event-log.js");
  const captureMetaMod = await import("../capture/metadata.js");
  const timelineMod = await import("../editor/timeline.js");
  const rendererMod = await import("../editor/renderer.js");
  const specMod = await import("../spec/loader.js");
  const pathMod = await import("node:path");

  const events = await eventLogMod.readEventLog(eventsPath);
  log.info(`Loaded ${String(events.length)} events`);

  const assetsDir = pathMod.dirname(eventsPath);
  const meta = await captureMetaMod.readCaptureMetadataMaybe(
    pathMod.join(assetsDir, "metadata.json"),
  );
  const t0 = meta?.startTimestamp;
  if (t0) log.info(`Using capture startTimestamp: ${String(t0)}`);

  const dummySpec = specMod.validateSpec({
    meta: { title: "Demo", resolution: { width: 1920, height: 1080 } },
    runner: { url: "http://localhost:3000" },
    chapters: [{ title: "Content", steps: [{ action: "wait", timeout: 1000 }] }],
  });

  const timeline = timelineMod.buildTimeline(events, dummySpec, t0);
  const renderer = rendererMod.createRenderer(opts.renderer);
  const outputPath = pathMod.join(opts.output, "output.mp4");

  await renderer.render(timeline, {
    outputPath,
    videoPath: pathMod.join(assetsDir, "video.webm"),
  });

  log.info(`Output: ${outputPath}`);
}
