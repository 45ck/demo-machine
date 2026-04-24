import type { DemoSpec } from "../spec/types.js";
import { createLogger } from "../utils/logger.js";
import type { GlobalOptions } from "./options.js";
import type { NarrationSettings } from "./narration.js";
import { captureFromSpec } from "./capture.js";
import { prepareNarration, writeSubtitlesFromTimed } from "./narration.js";
import { displayTimelineAndSaveSegments } from "./timeline-display.js";

export { runEditPipeline } from "./edit-pipeline.js";

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

/** Filter out empty collections from Phase 4 screenshot data. */
function buildNonEmptyScreenshotData(
  raw: import("../playback/screenshot-collector.js").ScreenshotCollectorResults | undefined,
):
  | {
      stepScreenshots?: Map<number, Buffer>;
      assertScreenshotPairs?: Array<{ stepIndex: number; before: Buffer; after: Buffer }>;
      cursorPositions?: Array<{
        stepIndex: number;
        cursorX: number;
        cursorY: number;
        targetCenterX: number;
        targetCenterY: number;
      }>;
      chapterTitleScreenshots?: Map<number, Buffer>;
    }
  | undefined {
  if (!raw) return undefined;
  const result: NonNullable<ReturnType<typeof buildNonEmptyScreenshotData>> = {};
  if (raw.stepScreenshots.size > 0) result.stepScreenshots = raw.stepScreenshots;
  if (raw.assertScreenshotPairs.length > 0)
    result.assertScreenshotPairs = raw.assertScreenshotPairs;
  if (raw.cursorPositions.length > 0) result.cursorPositions = raw.cursorPositions;
  if (raw.chapterTitleScreenshots.size > 0)
    result.chapterTitleScreenshots = raw.chapterTitleScreenshots;
  return result;
}

async function runEditPhase(params: {
  capture: Awaited<ReturnType<typeof captureFromSpec>>;
  spec: DemoSpec;
  opts: GlobalOptions;
  settings: NarrationSettings;
}): Promise<void> {
  const timelineMod = await import("../editor/timeline.js");
  const { workingCapture, trim } = await prepareTrimmedCapture({
    capture: params.capture,
    opts: params.opts,
  });

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

  if (narrationPrep.timedSegments) {
    displayTimelineAndSaveSegments({
      timedSegments: narrationPrep.timedSegments,
      events: workingCapture.events,
      startTimestamp: workingCapture.startTimestamp,
      spec: workingCapture.spec,
      totalDurationMs: narrationPrep.timeline.totalDurationMs,
      outputDir: params.opts.output,
      showTimeline: params.opts.timeline,
    });
  }

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

  const screenshotData = buildNonEmptyScreenshotData(params.capture.screenshotData);

  await runPostRenderQualityGate({
    outputPath,
    spec: params.spec,
    events: workingCapture.events,
    ...(narrationPrep.timedSegments ? { narrationSegments: narrationPrep.timedSegments } : {}),
    startTimestamp: workingCapture.startTimestamp,
    ...(screenshotData ? { screenshotData } : {}),
  });

  log.info(`Output: ${outputPath}`);
}

export async function runFullPipeline(params: {
  spec: DemoSpec;
  specPath?: string;
  /** Explicit specDir override forwarded to captureFromSpec. */
  specDir?: string | undefined;
  opts: GlobalOptions;
  settings: NarrationSettings;
}): Promise<void> {
  const capture = await captureFromSpec({
    spec: params.spec,
    ...(params.specPath ? { specPath: params.specPath } : {}),
    ...(params.specDir !== undefined ? { specDir: params.specDir } : {}),
    opts: params.opts,
    settings: params.settings,
  });

  if (!params.opts.edit) {
    log.info(`Capture complete: ${capture.videoPath}`);
    return;
  }

  await runEditPhase({
    capture,
    spec: params.spec,
    opts: params.opts,
    settings: params.settings,
  });
}

/** Build narration-to-action index lookup by walking spec chapters. */
function buildNarrationToActionMap(spec: DemoSpec): number[] {
  const map: number[] = [];
  let stepIdx = 0;
  for (const chapter of spec.chapters ?? []) {
    for (const step of chapter.steps ?? []) {
      if (step.narration) map.push(stepIdx);
      stepIdx++;
    }
  }
  return map;
}

/** Prepare quality-gate inputs from capture events and narration segments. */
function buildQualityGateInputs(params: {
  spec: DemoSpec;
  events: import("../playback/types.js").ActionEvent[];
  narrationSegments: import("../narration/types.js").TimedNarrationSegment[];
  startTimestamp: number;
}): {
  events: Array<{ action: string; timestamp: number; duration: number }>;
  narrationSegments: Array<{ actionIndex: number; startMs: number; text: string }>;
} {
  const t0 = params.startTimestamp;
  const events = params.events.map((e) => ({
    action: e.action,
    timestamp: e.timestamp - t0,
    duration: e.duration,
  }));
  const narrationToAction = buildNarrationToActionMap(params.spec);
  const narrationSegments = params.narrationSegments.map((seg, i) => ({
    actionIndex: narrationToAction[i] ?? i,
    startMs: seg.startMs,
    text: seg.text,
  }));
  return { events, narrationSegments };
}

export async function runPostRenderQualityGate(params: {
  outputPath: string;
  spec: DemoSpec;
  events?: import("../playback/types.js").ActionEvent[];
  narrationSegments?: import("../narration/types.js").TimedNarrationSegment[];
  startTimestamp?: number;
  /** Phase 4 visual data from ScreenshotCollector. */
  screenshotData?: {
    stepScreenshots?: Map<number, Buffer>;
    assertScreenshotPairs?: Array<{ stepIndex: number; before: Buffer; after: Buffer }>;
    cursorPositions?: Array<{
      stepIndex: number;
      cursorX: number;
      cursorY: number;
      targetCenterX: number;
      targetCenterY: number;
    }>;
    chapterTitleScreenshots?: Map<number, Buffer>;
  };
}): Promise<void> {
  const qualityMod = await import("../quality/runner.js");
  let gate: Awaited<ReturnType<typeof qualityMod.runQualityGate>>;

  try {
    const inputs =
      params.events && params.narrationSegments && params.startTimestamp !== undefined
        ? buildQualityGateInputs({
            spec: params.spec,
            events: params.events,
            narrationSegments: params.narrationSegments,
            startTimestamp: params.startTimestamp,
          })
        : undefined;

    gate = await qualityMod.runQualityGate({
      outputMp4Path: params.outputPath,
      spec: params.spec,
      events: inputs?.events,
      narrationSegments: inputs?.narrationSegments,
      ...(params.screenshotData ?? {}),
    });
  } catch (err) {
    throw new Error(
      `Quality gate failed to run: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  for (const r of gate.results) {
    if (r.status !== "pass") {
      log.warn(`[quality] ${r.checkName}: ${r.message}`);
    }
  }
  if (gate.hasFailures) {
    const failures = gate.results.filter((r) => r.status === "fail");
    const failureSummary = failures.map((r) => `  - ${r.checkName}: ${r.message}`).join("\n");
    throw new Error(
      `Quality gate failed: ${String(failures.length)} check(s) failed out of ${String(gate.results.length)}\n${failureSummary}`,
    );
  }

  log.info(`Quality gate passed (${gate.results.length} checks, ${gate.durationMs}ms)`);
}
