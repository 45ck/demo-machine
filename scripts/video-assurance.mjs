#!/usr/bin/env node
/**
 * video-assurance.mjs — Full-video visual assurance for rendered demos.
 *
 * Scans capture output directories for output.mp4 + events.json, extracts
 * diagnostic frames at step boundaries and interval samples, then checks for
 * blank frames, frozen frame runs, and unusually large visual jumps.
 *
 * Usage:
 *   node scripts/video-assurance.mjs
 *   node scripts/video-assurance.mjs --output-dir output/example-suite
 *   node scripts/video-assurance.mjs --filter todo --interval-sec 1
 *   node scripts/video-assurance.mjs --help
 */
import { spawnSync } from "node:child_process";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_INTERVAL_SEC = 2;
const DEFAULT_START_SAMPLE_OFFSET_SEC = 0.25;
const MIN_SAMPLE_GAP_SEC = 0.08;
const BLANK_STDDEV_THRESHOLD = 4;
const BLANK_DARK_LUMA = 8;
const BLANK_LIGHT_LUMA = 247;
const FREEZE_DIFF_PERCENT = 0.08;
const FREEZE_MIN_SPAN_SEC = 8;
const LARGE_CHANGE_PERCENT = 55;

class UsageError extends Error {}

const VALUE_OPTIONS = new Set([
  "--output-dir",
  "--filter",
  "--interval-sec",
  "--start-sample-offset-sec",
  "--blank-stddev",
  "--freeze-diff-percent",
  "--freeze-min-span-sec",
  "--large-change-percent",
]);

const FLAG_OPTIONS = new Set(["--keep-existing", "-h", "--help"]);

function parseArgs(argv) {
  const opts = {
    outputDir: null,
    filter: null,
    intervalSec: DEFAULT_INTERVAL_SEC,
    startSampleOffsetSec: DEFAULT_START_SAMPLE_OFFSET_SEC,
    blankStddev: BLANK_STDDEV_THRESHOLD,
    freezeDiffPercent: FREEZE_DIFF_PERCENT,
    freezeMinSpanSec: FREEZE_MIN_SPAN_SEC,
    largeChangePercent: LARGE_CHANGE_PERCENT,
    keepExisting: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const rawArg = argv[i];
    const equalsIndex = rawArg.indexOf("=");
    const arg = equalsIndex === -1 ? rawArg : rawArg.slice(0, equalsIndex);
    let value = equalsIndex === -1 ? null : rawArg.slice(equalsIndex + 1);

    if (FLAG_OPTIONS.has(arg)) {
      if (value != null) {
        throw new UsageError(`${arg} does not accept a value`);
      }
      if (arg === "--keep-existing") {
        opts.keepExisting = true;
      } else {
        opts.help = true;
      }
      continue;
    }

    if (!VALUE_OPTIONS.has(arg)) {
      throw new UsageError(`Unknown option: ${rawArg}`);
    }

    if (value == null) {
      value = argv[++i] ?? null;
    }
    if (value == null || value.startsWith("--")) {
      throw new UsageError(`Missing value for ${arg}`);
    }

    if (arg === "--output-dir") {
      opts.outputDir = value;
    } else if (arg === "--filter") {
      opts.filter = value;
    } else if (arg === "--interval-sec") {
      opts.intervalSec = Number(value);
    } else if (arg === "--start-sample-offset-sec") {
      opts.startSampleOffsetSec = Number(value);
    } else if (arg === "--blank-stddev") {
      opts.blankStddev = Number(value);
    } else if (arg === "--freeze-diff-percent") {
      opts.freezeDiffPercent = Number(value);
    } else if (arg === "--freeze-min-span-sec") {
      opts.freezeMinSpanSec = Number(value);
    } else if (arg === "--large-change-percent") {
      opts.largeChangePercent = Number(value);
    }
  }

  return opts;
}

function usage() {
  console.log(
    [
      "video-assurance — Full-video visual assurance for rendered demos",
      "",
      "Usage:",
      "  node scripts/video-assurance.mjs [options]",
      "",
      "Examples:",
      "  node scripts/video-assurance.mjs",
      "  node scripts/video-assurance.mjs --output-dir output/example-suite --filter todo",
      "  node scripts/video-assurance.mjs --interval-sec 1 --freeze-min-span-sec 3",
      "",
      "Options:",
      "  --output-dir <dir>              Capture root (default: output/example-suite)",
      "  --filter <substring>            Process only matching capture directory names",
      "  --interval-sec <seconds>        Interval sample cadence (default: 2)",
      "  --start-sample-offset-sec <sec> Sample playback start after initial render (default: 0.25)",
      "  --blank-stddev <value>          Low-variance blank threshold (default: 4)",
      "  --freeze-diff-percent <pct>     Adjacent frame diff treated as frozen (default: 0.08)",
      "  --freeze-min-span-sec <seconds> Minimum frozen span to flag (default: 2.5)",
      "  --large-change-percent <pct>    Adjacent frame diff treated as a large jump (default: 55)",
      "  --keep-existing                 Keep existing output/video-assurance frames",
      "  -h, --help                      Show this help message",
      "",
      "Output:",
      "  Writes output/video-assurance-report.json and diagnostic PNGs under output/video-assurance.",
      "",
      "Exit codes:",
      "  0  No visual assurance issues found",
      "  1  Blank/frozen/large-change issues found",
      "  2  Usage, dependency, or incomplete-analysis error",
    ].join("\n"),
  );
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runTool(command, args, errorContext) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(`${errorContext}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`${errorContext}${detail ? `: ${detail}` : ""}`);
  }

  return result.stdout;
}

function verifyTools() {
  try {
    runTool("ffmpeg", ["-version"], "ffmpeg is not available");
    runTool("ffprobe", ["-version"], "ffprobe is not available");
  } catch (error) {
    throw new UsageError(
      `${error.message}\nInstall ffmpeg and ffprobe, then ensure both are on PATH.`,
    );
  }
}

function loadOptionalImageLibs() {
  const require = createRequire(import.meta.url);
  const optional = {
    PNG: null,
    pixelmatch: null,
    warnings: [],
  };

  try {
    optional.PNG = require("pngjs").PNG;
  } catch {
    optional.warnings.push(
      "pngjs is not installed; frame extraction will run, but blank/frozen/regression checks are skipped.",
    );
  }

  try {
    const loaded = require("pixelmatch");
    optional.pixelmatch = loaded.default ?? loaded;
  } catch {
    optional.warnings.push(
      "pixelmatch is not installed; diff PNGs will not be written, using built-in frame comparison when pngjs is available.",
    );
  }

  return optional;
}

async function readJsonMaybe(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function safeName(value) {
  return String(value)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function discoverCaptures(outputDir, filter) {
  const captures = [];
  const normalizedFilter = filter?.toLowerCase() ?? null;

  async function visit(dir, depth) {
    const mp4 = path.join(dir, "output.mp4");
    const events = path.join(dir, "events.json");
    if ((await exists(mp4)) && (await exists(events))) {
      const slug = path.basename(dir);
      if (!normalizedFilter || slug.toLowerCase().includes(normalizedFilter)) {
        captures.push({ slug, dir, mp4, events });
      }
      return;
    }

    if (depth >= 2) return;

    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "video-assurance" || entry.name.startsWith(".")) continue;
      await visit(path.join(dir, entry.name), depth + 1);
    }
  }

  await visit(outputDir, 0);
  return captures.sort((a, b) => a.dir.localeCompare(b.dir));
}

function ffprobeVideo(mp4Path) {
  const stdout = runTool(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,avg_frame_rate,duration:format=duration",
      "-of",
      "json",
      mp4Path,
    ],
    `ffprobe failed for ${mp4Path}`,
  );
  const data = JSON.parse(stdout);
  const stream = data.streams?.[0] ?? {};
  const duration = Number(stream.duration ?? data.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Invalid video duration from ffprobe for ${mp4Path}`);
  }
  return {
    durationSec: duration,
    width: Number(stream.width) || null,
    height: Number(stream.height) || null,
    avgFrameRate: stream.avg_frame_rate ?? null,
  };
}

function extractFrame(mp4Path, timeSec, outPath) {
  runTool(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      timeSec.toFixed(3),
      "-i",
      mp4Path,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outPath,
    ],
    `ffmpeg failed extracting ${outPath}`,
  );
}

function inferStartTimestamp(events, metadata) {
  if (Number.isFinite(metadata?.startTimestamp)) return metadata.startTimestamp;
  const first = events.find((event) => Number.isFinite(event?.timestamp));
  return first?.timestamp ?? 0;
}

function clampTime(timeSec, durationSec) {
  const lastReadableFrameSec = Math.max(0, durationSec - 0.05);
  return Math.max(0, Math.min(lastReadableFrameSec, timeSec));
}

function addSample(samples, sample) {
  if (!Number.isFinite(sample.timeSec)) return;
  samples.push({
    ...sample,
    timeSec: Number(sample.timeSec.toFixed(3)),
  });
}

function collectSamples(events, metadata, durationSec, intervalSec, startSampleOffsetSec) {
  const samples = [];
  const startTimestamp = inferStartTimestamp(events, metadata);

  if (startSampleOffsetSec >= MIN_SAMPLE_GAP_SEC && durationSec > MIN_SAMPLE_GAP_SEC) {
    addSample(samples, { reason: "initial-frame", timeSec: 0 });
  }
  addSample(samples, {
    reason: "video-start",
    timeSec: clampTime(startSampleOffsetSec, durationSec),
  });
  for (let timeSec = intervalSec; timeSec < durationSec; timeSec += intervalSec) {
    addSample(samples, { reason: "interval", timeSec: clampTime(timeSec, durationSec) });
  }
  addSample(samples, { reason: "video-end", timeSec: Math.max(0, durationSec - 0.05) });

  events.forEach((event, index) => {
    if (!Number.isFinite(event?.timestamp)) return;
    const startSec = (event.timestamp - startTimestamp) / 1000;
    const endSec = startSec + (Number(event.duration) || 0) / 1000;
    const label = event.action
      ? `${event.action}-${String(index + 1).padStart(3, "0")}`
      : `step-${index + 1}`;
    addSample(samples, {
      reason: "step-start",
      stepIndex: index,
      action: event.action ?? null,
      timeSec: clampTime(startSec, durationSec),
      label,
    });
    addSample(samples, {
      reason: "step-end",
      stepIndex: index,
      action: event.action ?? null,
      timeSec: clampTime(endSec, durationSec),
      label,
    });
  });

  samples.sort((a, b) => a.timeSec - b.timeSec || a.reason.localeCompare(b.reason));

  const deduped = [];
  for (const sample of samples) {
    const previous = deduped.at(-1);
    if (previous && Math.abs(previous.timeSec - sample.timeSec) < MIN_SAMPLE_GAP_SEC) {
      previous.reasons = Array.from(
        new Set([...(previous.reasons ?? [previous.reason]), sample.reason]),
      );
      if (previous.stepIndex == null && sample.stepIndex != null) {
        previous.stepIndex = sample.stepIndex;
        previous.action = sample.action;
        previous.label = sample.label;
      }
      continue;
    }
    deduped.push({ ...sample, reasons: [sample.reason] });
  }

  return deduped;
}

function pngStats(PNG, fileBuffer) {
  const png = PNG.sync.read(fileBuffer);
  let sum = 0;
  let sumSquares = 0;
  let transparent = 0;
  const pixels = png.width * png.height;

  for (let i = 0; i < png.data.length; i += 4) {
    const alpha = png.data[i + 3];
    if (alpha === 0) transparent++;
    const luma = 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
    sum += luma;
    sumSquares += luma * luma;
  }

  const meanLuma = pixels > 0 ? sum / pixels : 0;
  const variance = pixels > 0 ? sumSquares / pixels - meanLuma * meanLuma : 0;
  const stddevLuma = Math.sqrt(Math.max(0, variance));

  return {
    png,
    width: png.width,
    height: png.height,
    pixels,
    meanLuma,
    stddevLuma,
    transparentPercent: pixels > 0 ? (transparent / pixels) * 100 : 0,
  };
}

function comparePngs(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    return {
      diffPercent: 100,
      avgChannelDelta: 255,
      dimensionMismatch: true,
    };
  }

  let changed = 0;
  let totalDelta = 0;
  const pixels = a.width * a.height;
  for (let i = 0; i < a.data.length; i += 4) {
    const delta =
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]);
    totalDelta += delta / 3;
    if (delta > 24) changed++;
  }

  return {
    diffPercent: pixels > 0 ? (changed / pixels) * 100 : 0,
    avgChannelDelta: pixels > 0 ? totalDelta / pixels : 0,
    dimensionMismatch: false,
  };
}

async function writeDiffPng(PNG, pixelmatch, previous, current, outPath) {
  if (!pixelmatch) return false;
  if (previous.width !== current.width || previous.height !== current.height) return false;

  const diff = new PNG({ width: current.width, height: current.height });
  pixelmatch(previous.data, current.data, diff.data, current.width, current.height, {
    threshold: 0.1,
  });
  await writeFile(outPath, PNG.sync.write(diff));
  return true;
}

function frameName(index, sample) {
  const prefix = String(index + 1).padStart(4, "0");
  const time = sample.timeSec.toFixed(3).replace(".", "p");
  const reason = safeName(sample.reasons?.join("+") ?? sample.reason);
  const detail = sample.label ? `-${safeName(sample.label)}` : "";
  return `${prefix}-${time}s-${reason}${detail}.png`;
}

function isBlankFrame(stats, blankStddev) {
  if (stats.transparentPercent > 99) return true;
  if (stats.stddevLuma > blankStddev) return false;
  return stats.meanLuma <= BLANK_DARK_LUMA || stats.meanLuma >= BLANK_LIGHT_LUMA;
}

function isInitialRenderFrame(frame) {
  return frame.timeSec === 0 && frame.reasons.includes("initial-frame");
}

function isStepBoundaryFrame(frame) {
  return frame.reasons.includes("step-start") || frame.reasons.includes("step-end");
}

function shouldCompareForMotion(previous, frame) {
  return !isInitialRenderFrame(previous) && !isInitialRenderFrame(frame);
}

function shouldFlagLargeJump({ comparison, previous, frame, gapSec, intervalSec, threshold }) {
  return (
    !comparison.dimensionMismatch &&
    shouldCompareForMotion(previous, frame) &&
    comparison.diffPercent >= threshold &&
    gapSec <= intervalSec * 1.5 &&
    !isStepBoundaryFrame(previous) &&
    !isStepBoundaryFrame(frame)
  );
}

function issue(message, details = {}) {
  return { message, ...details };
}

async function analyzeCapture(capture, params) {
  const warnings = [];
  const issues = [];
  const video = ffprobeVideo(capture.mp4);
  const events = await readJsonMaybe(capture.events);
  const metadata = await readJsonMaybe(path.join(capture.dir, "metadata.json"));

  if (!Array.isArray(events)) {
    return {
      slug: capture.slug,
      dir: capture.dir,
      status: "error",
      error: "events.json is missing or is not an array",
      warnings,
      issues: [issue("events.json is missing or is not an array")],
      frames: [],
      video,
    };
  }

  const samples = collectSamples(
    events,
    metadata,
    video.durationSec,
    params.intervalSec,
    params.startSampleOffsetSec,
  );
  const captureOutDir = path.join(params.diagnosticsDir, safeName(capture.slug));
  await mkdir(captureOutDir, { recursive: true });

  const frames = [];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const fileName = frameName(i, sample);
    const framePath = path.join(captureOutDir, fileName);
    extractFrame(capture.mp4, sample.timeSec, framePath);
    frames.push({
      index: i,
      timeSec: sample.timeSec,
      reasons: sample.reasons,
      stepIndex: sample.stepIndex ?? null,
      action: sample.action ?? null,
      path: path.relative(params.root, framePath).replaceAll("\\", "/"),
    });
  }

  if (!params.PNG) {
    warnings.push("Skipped pixel analysis because pngjs is unavailable.");
    return {
      slug: capture.slug,
      dir: capture.dir,
      status: "skipped-analysis",
      warnings,
      issues,
      frames,
      video,
      eventCount: events.length,
    };
  }

  let frozenRun = null;
  const frozenRuns = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const buffer = await readFile(path.join(params.root, frame.path));
    const stats = pngStats(params.PNG, buffer);

    frame.width = stats.width;
    frame.height = stats.height;
    frame.meanLuma = Number(stats.meanLuma.toFixed(2));
    frame.stddevLuma = Number(stats.stddevLuma.toFixed(2));
    frame.transparentPercent = Number(stats.transparentPercent.toFixed(2));

    if (isBlankFrame(stats, params.blankStddev)) {
      frame.blank = true;
      const blankDetails = {
        frame: frame.path,
        timeSec: frame.timeSec,
        reasons: frame.reasons,
        meanLuma: frame.meanLuma,
        stddevLuma: frame.stddevLuma,
        transparentPercent: frame.transparentPercent,
      };
      if (isInitialRenderFrame(frame)) {
        warnings.push(
          issue(
            "Initial render frame is blank or near-blank; not treated as a failure",
            blankDetails,
          ),
        );
      } else {
        issues.push(issue("Blank or near-blank frame detected", blankDetails));
      }
    }

    if (i === 0) {
      frame._png = stats.png;
      continue;
    }

    const previous = frames[i - 1];
    const comparison = comparePngs(previous._png, stats.png);
    const gapSec = frame.timeSec - previous.timeSec;
    frame.previousDiffPercent = Number(comparison.diffPercent.toFixed(3));
    frame.previousAvgChannelDelta = Number(comparison.avgChannelDelta.toFixed(2));

    if (comparison.dimensionMismatch) {
      issues.push(
        issue("Frame dimensions changed within one video", {
          previousFrame: previous.path,
          frame: frame.path,
        }),
      );
    }

    if (
      shouldCompareForMotion(previous, frame) &&
      comparison.diffPercent <= params.freezeDiffPercent &&
      gapSec > 0.25
    ) {
      frozenRun ??= {
        startIndex: i - 1,
        endIndex: i,
        startTimeSec: previous.timeSec,
        endTimeSec: frame.timeSec,
        maxDiffPercent: comparison.diffPercent,
      };
      frozenRun.endIndex = i;
      frozenRun.endTimeSec = frame.timeSec;
      frozenRun.maxDiffPercent = Math.max(frozenRun.maxDiffPercent, comparison.diffPercent);
    } else if (frozenRun) {
      frozenRuns.push(frozenRun);
      frozenRun = null;
    }

    if (
      shouldFlagLargeJump({
        comparison,
        previous,
        frame,
        gapSec,
        intervalSec: params.intervalSec,
        threshold: params.largeChangePercent,
      })
    ) {
      const diffPath = path.join(captureOutDir, `diff-${String(i).padStart(4, "0")}.png`);
      const wroteDiff = await writeDiffPng(
        params.PNG,
        params.pixelmatch,
        previous._png,
        stats.png,
        diffPath,
      );
      warnings.push(
        issue("Large visual jump between interval samples", {
          previousFrame: previous.path,
          frame: frame.path,
          previousTimeSec: previous.timeSec,
          timeSec: frame.timeSec,
          gapSec: Number(gapSec.toFixed(3)),
          diffPercent: frame.previousDiffPercent,
          ...(wroteDiff
            ? { diffPath: path.relative(params.root, diffPath).replaceAll("\\", "/") }
            : {}),
        }),
      );
    }

    frame._png = stats.png;
  }

  if (frozenRun) frozenRuns.push(frozenRun);

  for (const run of frozenRuns) {
    const spanSec = run.endTimeSec - run.startTimeSec;
    if (spanSec < params.freezeMinSpanSec) continue;
    const start = frames[run.startIndex];
    const end = frames[run.endIndex];
    issues.push(
      issue("Frozen frame run detected", {
        startFrame: start.path,
        endFrame: end.path,
        startTimeSec: start.timeSec,
        endTimeSec: end.timeSec,
        spanSec: Number(spanSec.toFixed(3)),
        maxDiffPercent: Number(run.maxDiffPercent.toFixed(3)),
      }),
    );
  }

  for (const frame of frames) {
    delete frame._png;
  }

  return {
    slug: capture.slug,
    dir: capture.dir,
    status: issues.length > 0 ? "fail" : "pass",
    warnings,
    issues,
    frames,
    video,
    eventCount: events.length,
  };
}

function validateOptions(opts) {
  const numeric = [
    ["--interval-sec", opts.intervalSec],
    ["--start-sample-offset-sec", opts.startSampleOffsetSec],
    ["--blank-stddev", opts.blankStddev],
    ["--freeze-diff-percent", opts.freezeDiffPercent],
    ["--freeze-min-span-sec", opts.freezeMinSpanSec],
    ["--large-change-percent", opts.largeChangePercent],
  ];
  for (const [name, value] of numeric) {
    if (!Number.isFinite(value) || value < 0) {
      throw new UsageError(`Invalid ${name}: ${String(value)}`);
    }
  }
  if (opts.intervalSec <= 0) {
    throw new UsageError("--interval-sec must be greater than 0");
  }
  if (opts.blankStddev > 255) {
    throw new UsageError("--blank-stddev must be between 0 and 255");
  }
  for (const [name, value] of [
    ["--freeze-diff-percent", opts.freezeDiffPercent],
    ["--large-change-percent", opts.largeChangePercent],
  ]) {
    if (value > 100) {
      throw new UsageError(`${name} must be between 0 and 100`);
    }
  }
}

function exitCodeForStatus(status) {
  if (status === "fail" || status === "error") return 1;
  if (status === "skipped-analysis") return 2;
  return 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    process.exit(0);
  }
  validateOptions(opts);
  verifyTools();

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, "..");
  const outputDir = opts.outputDir
    ? path.resolve(opts.outputDir)
    : path.join(root, "output", "example-suite");
  const reportPath = path.join(root, "output", "video-assurance-report.json");
  const diagnosticsDir = path.join(root, "output", "video-assurance");

  if (!(await exists(outputDir))) {
    throw new UsageError(`Output directory does not exist: ${outputDir}`);
  }

  if (!opts.keepExisting) {
    await rm(diagnosticsDir, { recursive: true, force: true });
  }
  await mkdir(diagnosticsDir, { recursive: true });

  const imageLibs = loadOptionalImageLibs();
  const captures = await discoverCaptures(outputDir, opts.filter);
  if (captures.length === 0) {
    throw new UsageError(
      `No capture directories with output.mp4 and events.json found in ${outputDir}`,
    );
  }

  console.log("Video assurance");
  console.log(`  Output dir:     ${outputDir}`);
  console.log(`  Diagnostics:    ${diagnosticsDir}`);
  console.log(`  Captures found: ${captures.length}`);
  console.log("");

  const report = {
    status: "pass",
    generatedAt: new Date().toISOString(),
    outputDir,
    diagnosticsDir: path.relative(root, diagnosticsDir).replaceAll("\\", "/"),
    thresholds: {
      intervalSec: opts.intervalSec,
      startSampleOffsetSec: opts.startSampleOffsetSec,
      blankStddev: opts.blankStddev,
      freezeDiffPercent: opts.freezeDiffPercent,
      freezeMinSpanSec: opts.freezeMinSpanSec,
      largeChangePercent: opts.largeChangePercent,
    },
    warnings: imageLibs.warnings,
    summary: {
      captures: captures.length,
      passed: 0,
      failed: 0,
      skippedAnalysis: 0,
      issues: 0,
      framesExtracted: 0,
    },
    captures: [],
  };

  for (const capture of captures) {
    try {
      const result = await analyzeCapture(capture, {
        root,
        diagnosticsDir,
        intervalSec: opts.intervalSec,
        startSampleOffsetSec: opts.startSampleOffsetSec,
        blankStddev: opts.blankStddev,
        freezeDiffPercent: opts.freezeDiffPercent,
        freezeMinSpanSec: opts.freezeMinSpanSec,
        largeChangePercent: opts.largeChangePercent,
        PNG: imageLibs.PNG,
        pixelmatch: imageLibs.pixelmatch,
      });
      report.captures.push({
        ...result,
        dir: path.relative(root, result.dir).replaceAll("\\", "/"),
      });
      report.summary.framesExtracted += result.frames.length;
      report.summary.issues += result.issues.length;
      if (result.status === "pass") report.summary.passed++;
      if (result.status === "fail" || result.status === "error") report.summary.failed++;
      if (result.status === "skipped-analysis") report.summary.skippedAnalysis++;
      console.log(
        `  ${result.status.toUpperCase().padEnd(16)} ${capture.slug} (${result.frames.length} frame(s), ${result.issues.length} issue(s))`,
      );
    } catch (error) {
      const result = {
        slug: capture.slug,
        dir: path.relative(root, capture.dir).replaceAll("\\", "/"),
        status: "error",
        error: error?.message ?? String(error),
        warnings: [],
        issues: [issue(error?.message ?? String(error))],
        frames: [],
      };
      report.captures.push(result);
      report.summary.failed++;
      report.summary.issues++;
      console.log(`  ERROR            ${capture.slug} (${result.error})`);
    }
  }

  if (report.summary.failed > 0) {
    report.status = "fail";
  } else if (report.summary.skippedAnalysis > 0) {
    report.status = "skipped-analysis";
  }

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log("");
  console.log(`Report written to: ${path.relative(root, reportPath)}`);
  console.log(`Diagnostic frames: ${path.relative(root, diagnosticsDir)}`);
  console.log(`Status: ${report.status.toUpperCase()}`);

  process.exit(exitCodeForStatus(report.status));
}

export {
  UsageError,
  collectSamples,
  comparePngs,
  exitCodeForStatus,
  isBlankFrame,
  isInitialRenderFrame,
  isStepBoundaryFrame,
  parseArgs,
  shouldCompareForMotion,
  shouldFlagLargeJump,
  validateOptions,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    if (error instanceof UsageError) {
      console.error(`Error: ${error.message}`);
      process.exit(2);
    }
    console.error(error?.stack ?? String(error));
    process.exit(2);
  });
}
