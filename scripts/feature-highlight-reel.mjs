#!/usr/bin/env node
/**
 * feature-highlight-reel.mjs — Montage of best demo moments.
 *
 * Creates a single highlight video cutting between the best moments of all demos.
 * For each demo with an output.mp4, it extracts a short clip from the action-rich
 * middle section (20%-60%) and concatenates them with title cards and crossfades.
 *
 * Usage:
 *   node scripts/feature-highlight-reel.mjs
 *   node scripts/feature-highlight-reel.mjs --output output/highlight.mp4
 *   node scripts/feature-highlight-reel.mjs --clip-duration 8
 *   node scripts/feature-highlight-reel.mjs --filter todo-app,form-wizard
 *   node scripts/feature-highlight-reel.mjs --help
 *
 * Requires ffmpeg and ffprobe on PATH.
 */
import { execSync } from "node:child_process";
import { access, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    output: "output/feature-highlight-reel.mp4",
    clipDuration: 6,
    filter: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--output") {
      opts.output = argv[++i] ?? opts.output;
    } else if (a === "--clip-duration") {
      const raw = argv[++i];
      opts.clipDuration = raw ? Number(raw) : opts.clipDuration;
    } else if (a === "--filter") {
      opts.filter = argv[++i] ?? null;
    } else if (a === "-h" || a === "--help") {
      opts.help = true;
    }
  }

  return opts;
}

function usage() {
  console.log(
    [
      "feature-highlight-reel — Montage of best demo moments",
      "",
      "Usage:",
      "  node scripts/feature-highlight-reel.mjs [options]",
      "",
      "Options:",
      "  --output <path>         Output MP4 path (default: output/feature-highlight-reel.mp4)",
      "  --clip-duration <sec>   Duration per demo clip in seconds (default: 6)",
      "  --filter <slugs>        Comma-separated list of demo slugs to include",
      "  -h, --help              Show this help message",
      "",
      "Requires ffmpeg and ffprobe on PATH.",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get video duration in seconds via ffprobe.
 */
function ffprobeDuration(mp4Path) {
  const result = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${mp4Path}"`,
    { encoding: "utf8" },
  );
  const v = Number(result.trim());
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`Invalid duration from ffprobe for ${mp4Path}: ${result.trim()}`);
  }
  return v;
}

/**
 * Convert a slug to a presentable title.
 * e.g. "todo-app" -> "Todo App", "async-skeleton" -> "Async Skeleton"
 */
function slugToTitle(slug) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Generate a title card MP4 with centered white text on a black background.
 */
function generateTitleCard(text, outPath, durationSec, width, height) {
  // Escape special characters for ffmpeg drawtext filter.
  // Colons and backslashes need escaping; single quotes are replaced.
  const escaped = text.replace(/\\/g, "\\\\\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019");

  const cmd = [
    "ffmpeg -y -hide_banner -loglevel error",
    `-f lavfi -i color=c=black:s=${width}x${height}:d=${durationSec.toFixed(3)}:r=30`,
    `-vf "drawtext=text='${escaped}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2"`,
    "-c:v libx264 -pix_fmt yuv420p -preset ultrafast",
    `"${outPath}"`,
  ].join(" ");

  execSync(cmd);
}

/**
 * Extract a clip from an MP4.
 */
function extractClip(mp4Path, startSec, durationSec, outPath) {
  const cmd = [
    "ffmpeg -y -hide_banner -loglevel error",
    `-ss ${startSec.toFixed(3)}`,
    `-t ${durationSec.toFixed(3)}`,
    `-i "${mp4Path}"`,
    "-c:v libx264 -pix_fmt yuv420p -preset ultrafast",
    "-an",
    `"${outPath}"`,
  ].join(" ");

  execSync(cmd);
}

/**
 * Re-encode a segment to ensure uniform codec parameters for concatenation.
 * Forces 1280x720, 30fps, yuv420p, h264.
 */
function normalizeSegment(inputPath, outPath, width, height) {
  const cmd = [
    "ffmpeg -y -hide_banner -loglevel error",
    `-i "${inputPath}"`,
    `-vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30"`,
    "-c:v libx264 -pix_fmt yuv420p -preset ultrafast",
    "-an",
    `"${outPath}"`,
  ].join(" ");

  execSync(cmd);
}

/**
 * Concatenate segments using the ffmpeg concat demuxer.
 */
function concatSegments(listPath, outPath) {
  const cmd = [
    "ffmpeg -y -hide_banner -loglevel error",
    `-f concat -safe 0 -i "${listPath}"`,
    "-c:v libx264 -pix_fmt yuv420p -preset medium",
    "-movflags +faststart",
    `"${outPath}"`,
  ].join(" ");

  execSync(cmd);
}

/**
 * Add crossfade transitions between segments.
 * This applies 0.3s crossfades at the boundaries of each segment pair.
 */
function addCrossfades(segmentPaths, fadeDuration, outPath) {
  if (segmentPaths.length === 0) return;
  if (segmentPaths.length === 1) {
    // Just copy
    execSync(`ffmpeg -y -hide_banner -loglevel error -i "${segmentPaths[0]}" -c copy "${outPath}"`);
    return;
  }

  // For many segments, the xfade filter chain gets complex.
  // Build a filter_complex that chains xfade filters pairwise.
  const inputs = segmentPaths.map((p) => `-i "${p}"`).join(" ");

  let filterParts = [];
  let prevLabel = "[0:v]";
  for (let i = 1; i < segmentPaths.length; i++) {
    // We need the duration of the previous accumulated stream to know the offset.
    // For simplicity, we compute each segment's duration.
    const offset = computeXfadeOffset(segmentPaths, i, fadeDuration);
    const outLabel = i === segmentPaths.length - 1 ? "[outv]" : `[v${i}]`;
    filterParts.push(
      `${prevLabel}[${i}:v]xfade=transition=fade:duration=${fadeDuration}:offset=${offset.toFixed(3)}${outLabel}`,
    );
    prevLabel = outLabel;
  }

  const filterComplex = filterParts.join(";");
  const cmd = [
    `ffmpeg -y -hide_banner -loglevel error`,
    inputs,
    `-filter_complex "${filterComplex}"`,
    `-map "[outv]"`,
    "-c:v libx264 -pix_fmt yuv420p -preset medium -movflags +faststart",
    `"${outPath}"`,
  ].join(" ");

  execSync(cmd, { maxBuffer: 50 * 1024 * 1024 });
}

/**
 * Compute the xfade offset for the i-th transition.
 * The offset is the cumulative duration of all previous segments minus
 * the cumulative fade durations already applied.
 */
function computeXfadeOffset(segmentPaths, transitionIndex, fadeDuration) {
  let cumulativeDuration = 0;
  for (let j = 0; j < transitionIndex; j++) {
    cumulativeDuration += ffprobeDuration(segmentPaths[j]);
  }
  // Subtract fade durations for all previous transitions
  const previousFades = (transitionIndex - 1) * fadeDuration;
  return cumulativeDuration - previousFades - fadeDuration;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    usage();
    process.exit(0);
  }

  if (!Number.isFinite(opts.clipDuration) || opts.clipDuration <= 0) {
    console.error(`Invalid --clip-duration: ${String(opts.clipDuration)}`);
    process.exit(2);
  }

  // Verify ffmpeg + ffprobe are available.
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    execSync("ffprobe -version", { stdio: "ignore" });
  } catch {
    console.error("Error: ffmpeg and ffprobe are required on PATH.");
    process.exit(2);
  }

  const outputPath = path.resolve(root, opts.output);
  const captureRoot = path.join(root, "output", "example-suite");
  const tmpDir = path.join(root, "output", ".highlight-reel-tmp");

  // Clean and create tmp dir.
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });

  // Discover demos with output.mp4
  if (!(await fileExists(captureRoot))) {
    console.error(`Error: capture directory does not exist: ${captureRoot}`);
    console.error("Run the example suite capture first.");
    process.exit(1);
  }

  const entries = await readdir(captureRoot, { withFileTypes: true });
  let demos = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  // Apply filter
  if (opts.filter) {
    const allowed = new Set(opts.filter.split(",").map((s) => s.trim().toLowerCase()));
    demos = demos.filter((slug) => allowed.has(slug.toLowerCase()));
  }

  // Filter to only those with output.mp4
  const validDemos = [];
  for (const slug of demos) {
    const mp4 = path.join(captureRoot, slug, "output.mp4");
    if (await fileExists(mp4)) {
      validDemos.push({ slug, mp4 });
    }
  }

  if (validDemos.length === 0) {
    console.error("No demos with output.mp4 found.");
    process.exit(1);
  }

  console.log(`Found ${validDemos.length} demo(s) with output.mp4`);
  console.log(`Clip duration: ${opts.clipDuration}s`);
  console.log("");

  // Target resolution for the highlight reel.
  const WIDTH = 1280;
  const HEIGHT = 720;
  const TITLE_DURATION = 1.5;
  const FADE_DURATION = 0.3;

  const segments = [];
  const segmentMeta = [];
  let segmentIndex = 0;

  for (const { slug, mp4 } of validDemos) {
    const durationSec = ffprobeDuration(mp4);

    // Skip demos that are too short to clip.
    if (durationSec < 2) {
      console.log(`  SKIP  ${slug} — too short (${durationSec.toFixed(1)}s)`);
      continue;
    }

    const title = slugToTitle(slug);
    console.log(
      `  ${slug} — ${durationSec.toFixed(1)}s total, extracting ${opts.clipDuration}s clip`,
    );

    // Generate title card.
    const titlePath = path.join(tmpDir, `${String(segmentIndex).padStart(4, "0")}-title-raw.mp4`);
    const titleNormPath = path.join(tmpDir, `${String(segmentIndex).padStart(4, "0")}-title.mp4`);
    generateTitleCard(title, titlePath, TITLE_DURATION, WIDTH, HEIGHT);
    normalizeSegment(titlePath, titleNormPath, WIDTH, HEIGHT);
    segments.push(titleNormPath);
    segmentIndex++;

    // Compute clip start: extract from the 20%-60% range (where the action is).
    const actionStart = durationSec * 0.2;
    const actionEnd = durationSec * 0.6;
    const actionRange = actionEnd - actionStart;

    let clipStart;
    let clipLen = Math.min(opts.clipDuration, durationSec);

    if (actionRange >= clipLen) {
      // Center the clip in the action range.
      clipStart = actionStart + (actionRange - clipLen) / 2;
    } else {
      // If the action range is smaller than clip duration, expand outward.
      clipStart = Math.max(0, actionStart);
      clipLen = Math.min(clipLen, durationSec - clipStart);
    }

    // Extract and normalize the clip.
    const clipRawPath = path.join(tmpDir, `${String(segmentIndex).padStart(4, "0")}-clip-raw.mp4`);
    const clipNormPath = path.join(tmpDir, `${String(segmentIndex).padStart(4, "0")}-clip.mp4`);
    extractClip(mp4, clipStart, clipLen, clipRawPath);
    normalizeSegment(clipRawPath, clipNormPath, WIDTH, HEIGHT);
    segments.push(clipNormPath);
    segmentIndex++;

    segmentMeta.push({
      slug,
      title,
      sourceDurationSec: Number(durationSec.toFixed(2)),
      clipStartSec: Number(clipStart.toFixed(2)),
      clipDurationSec: Number(clipLen.toFixed(2)),
    });
  }

  if (segments.length === 0) {
    console.error("No segments were generated.");
    process.exit(1);
  }

  console.log("");
  console.log(`Generated ${segments.length} segment(s) from ${segmentMeta.length} demo(s).`);
  console.log("Concatenating with crossfade transitions...");

  // Use crossfade transitions if we have multiple segments, otherwise simple concat.
  if (segments.length <= 2) {
    // Few segments — just use concat demuxer (no crossfade needed for a single title+clip).
    const listPath = path.join(tmpDir, "concat-list.txt");
    const listContent = segments.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n");
    await writeFile(listPath, listContent);
    concatSegments(listPath, outputPath);
  } else {
    // Apply crossfades between all segments.
    addCrossfades(segments, FADE_DURATION, outputPath);
  }

  // Get final output duration.
  const finalDuration = ffprobeDuration(outputPath);

  // Write segment metadata JSON.
  const segmentsJsonPath = outputPath.replace(/\.mp4$/, "-segments.json");
  let runningTimestamp = 0;
  const timestampedSegments = segmentMeta.map((meta) => {
    const entry = {
      ...meta,
      titleStartSec: Number(runningTimestamp.toFixed(2)),
      clipStartInReelSec: Number((runningTimestamp + TITLE_DURATION).toFixed(2)),
    };
    runningTimestamp += TITLE_DURATION + meta.clipDurationSec;
    return entry;
  });

  const segmentsJson = {
    generatedAt: new Date().toISOString(),
    totalDurationSec: Number(finalDuration.toFixed(2)),
    clipDurationSec: opts.clipDuration,
    demoCount: segmentMeta.length,
    segments: timestampedSegments,
  };

  await writeFile(segmentsJsonPath, JSON.stringify(segmentsJson, null, 2) + "\n");

  // Clean up tmp dir.
  await rm(tmpDir, { recursive: true, force: true });

  console.log("");
  console.log(`Highlight reel: ${path.relative(root, outputPath)}`);
  console.log(`Segments JSON:  ${path.relative(root, segmentsJsonPath)}`);
  console.log(`Duration:       ${finalDuration.toFixed(1)}s`);
  console.log(`Demos:          ${segmentMeta.length}`);
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
