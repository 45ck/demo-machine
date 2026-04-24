#!/usr/bin/env node
/**
 * regression-reel.mjs — Side-by-side comparison video (baseline vs current).
 *
 * For each demo, extracts 5 key frames from the current output.mp4, compares
 * them against golden-frame baselines (if they exist), and produces a
 * side-by-side split-screen slideshow video. All demo slideshows are then
 * concatenated into a single regression reel.
 *
 * Usage:
 *   node scripts/regression-reel.mjs
 *   node scripts/regression-reel.mjs --baseline-dir baselines/golden-frames
 *   node scripts/regression-reel.mjs --output output/regression-reel.mp4
 *   node scripts/regression-reel.mjs --filter todo-app
 *   node scripts/regression-reel.mjs --help
 *
 * Requires ffmpeg and ffprobe on PATH.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
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
    baselineDir: "baselines/golden-frames",
    output: "output/regression-reel.mp4",
    filter: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--baseline-dir") {
      opts.baselineDir = argv[++i] ?? opts.baselineDir;
    } else if (a === "--output") {
      opts.output = argv[++i] ?? opts.output;
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
      "regression-reel — Side-by-side baseline vs current comparison video",
      "",
      "Usage:",
      "  node scripts/regression-reel.mjs [options]",
      "",
      "Options:",
      "  --baseline-dir <dir>   Golden frames baseline directory (default: baselines/golden-frames)",
      "  --output <path>        Output MP4 path (default: output/regression-reel.mp4)",
      "  --filter <slug>        Process only demos matching this substring",
      "  -h, --help             Show this help message",
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
 * Compute the five key timestamps for a given duration:
 *   0s, 25%, 50%, 75%, last-second
 * Matches the golden-frames.mjs keyTimestamps function.
 */
function keyTimestamps(durationSec) {
  return [
    0,
    durationSec * 0.25,
    durationSec * 0.5,
    durationSec * 0.75,
    Math.max(0, durationSec - 1),
  ];
}

const FRAME_NAMES = [
  "frame-01.png",
  "frame-02.png",
  "frame-03.png",
  "frame-04.png",
  "frame-05.png",
];

/**
 * Extract a single frame from an MP4 as a PNG.
 */
function extractFrame(mp4Path, timeSec, outPath) {
  execSync(
    `ffmpeg -y -hide_banner -loglevel error -ss ${timeSec.toFixed(3)} -i "${mp4Path}" -frames:v 1 -q:v 2 "${outPath}"`,
  );
}

/**
 * Convert a slug to a presentable title.
 */
function slugToTitle(slug) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Create a side-by-side comparison image using ffmpeg hstack.
 * Left = baseline, right = current.
 * Both images are scaled to the same height before stacking.
 */
function createSideBySide(leftPath, rightPath, outPath, halfWidth, height) {
  const cmd = [
    "ffmpeg -y -hide_banner -loglevel error",
    `-i "${leftPath}" -i "${rightPath}"`,
    `-filter_complex "[0:v]scale=${halfWidth}:${height}:force_original_aspect_ratio=decrease,pad=${halfWidth}:${height}:(ow-iw)/2:(oh-ih)/2[left];[1:v]scale=${halfWidth}:${height}:force_original_aspect_ratio=decrease,pad=${halfWidth}:${height}:(ow-iw)/2:(oh-ih)/2[right];[left][right]hstack=inputs=2"`,
    `"${outPath}"`,
  ].join(" ");

  execSync(cmd);
}

/**
 * Create a single-panel image for a new demo (no baseline).
 * Centers the current frame with a "NEW" label overlay.
 */
function createNewPanel(framePath, outPath, width, height) {
  const cmd = [
    "ffmpeg -y -hide_banner -loglevel error",
    `-i "${framePath}"`,
    `-vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,drawtext=text='NEW':fontsize=64:fontcolor=0x00ff88:borderw=3:bordercolor=black:x=w-text_w-20:y=20"`,
    `"${outPath}"`,
  ].join(" ");

  execSync(cmd);
}

/**
 * Create a slideshow video from a list of images with a text overlay title.
 * Each image is shown for frameDurationSec seconds.
 */
function createSlideshow(imagePaths, title, outPath, frameDurationSec, width, height) {
  // Write a concat list with each image as a duration entry.
  const listPath = outPath.replace(/\.mp4$/, "-list.txt");
  const listLines = imagePaths.map(
    (p) => `file '${p.replace(/\\/g, "/")}'\nduration ${frameDurationSec}`,
  );
  // The concat demuxer needs the last file repeated (without duration) to avoid truncation.
  listLines.push(`file '${imagePaths[imagePaths.length - 1].replace(/\\/g, "/")}'`);

  const listContent = listLines.join("\n");
  writeFileSync(listPath, listContent, "utf8");

  // Escape title for drawtext filter.
  const escaped = title.replace(/\\/g, "\\\\\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019");

  // Build the slideshow.
  const cmd = [
    "ffmpeg -y -hide_banner -loglevel error",
    `-f concat -safe 0 -i "${listPath}"`,
    `-vf "scale=${width}:${height},fps=30,drawtext=text='${escaped}':fontsize=32:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=15"`,
    "-c:v libx264 -pix_fmt yuv420p -preset ultrafast",
    `"${outPath}"`,
  ].join(" ");

  execSync(cmd);
}

/**
 * Concatenate segment videos using the ffmpeg concat demuxer.
 */
function concatSegments(segmentPaths, outPath) {
  const listPath = outPath.replace(/\.mp4$/, "-concat.txt");
  const listContent = segmentPaths.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n");
  writeFileSync(listPath, listContent, "utf8");

  const cmd = [
    "ffmpeg -y -hide_banner -loglevel error",
    `-f concat -safe 0 -i "${listPath}"`,
    "-c:v libx264 -pix_fmt yuv420p -preset medium -movflags +faststart",
    `"${outPath}"`,
  ].join(" ");

  execSync(cmd, { maxBuffer: 50 * 1024 * 1024 });
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
  const baselinesRoot = path.resolve(root, opts.baselineDir);
  const tmpDir = path.join(root, "output", ".regression-reel-tmp");

  // Clean and create tmp dir.
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });

  if (!(await fileExists(captureRoot))) {
    console.error(`Error: capture directory does not exist: ${captureRoot}`);
    console.error("Run the example suite capture first.");
    process.exit(1);
  }

  // Discover demos with output.mp4
  const entries = await readdir(captureRoot, { withFileTypes: true });
  let demos = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  if (opts.filter) {
    const f = opts.filter.toLowerCase();
    demos = demos.filter((slug) => slug.toLowerCase().includes(f));
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
  console.log(`Baselines dir: ${baselinesRoot}`);
  console.log("");

  // Reel dimensions: for side-by-side, use 1280x720 total (640 per side).
  const REEL_WIDTH = 1280;
  const REEL_HEIGHT = 720;
  const HALF_WIDTH = REEL_WIDTH / 2; // 640
  const FRAME_DURATION_SEC = 2;

  const slideshowPaths = [];
  const reelMeta = [];

  for (const { slug, mp4 } of validDemos) {
    const durationSec = ffprobeDuration(mp4);
    const times = keyTimestamps(durationSec);
    const demoTmpDir = path.join(tmpDir, slug);
    await mkdir(demoTmpDir, { recursive: true });

    const baselineDir = path.join(baselinesRoot, slug);
    const hasBaseline = await fileExists(baselineDir);

    console.log(
      `  ${slug} — ${durationSec.toFixed(1)}s, baseline: ${hasBaseline ? "yes" : "no (NEW)"}`,
    );

    // Extract current frames.
    const currentFrames = [];
    for (let i = 0; i < FRAME_NAMES.length; i++) {
      const framePath = path.join(demoTmpDir, `current-${FRAME_NAMES[i]}`);
      extractFrame(mp4, times[i], framePath);
      currentFrames.push(framePath);
    }

    // Create comparison frames.
    const comparisonFrames = [];
    for (let i = 0; i < FRAME_NAMES.length; i++) {
      const compPath = path.join(demoTmpDir, `comp-${FRAME_NAMES[i]}`);

      if (hasBaseline) {
        const baselinePath = path.join(baselineDir, FRAME_NAMES[i]);
        if (await fileExists(baselinePath)) {
          // Side-by-side: baseline (left) | current (right)
          createSideBySide(baselinePath, currentFrames[i], compPath, HALF_WIDTH, REEL_HEIGHT);
        } else {
          // Baseline dir exists but this specific frame is missing.
          createNewPanel(currentFrames[i], compPath, REEL_WIDTH, REEL_HEIGHT);
        }
      } else {
        // No baseline at all — mark as NEW.
        createNewPanel(currentFrames[i], compPath, REEL_WIDTH, REEL_HEIGHT);
      }

      comparisonFrames.push(compPath);
    }

    // Create a slideshow for this demo.
    const title = slugToTitle(slug) + (hasBaseline ? "  [Baseline | Current]" : "  [NEW]");
    const slideshowPath = path.join(demoTmpDir, "slideshow.mp4");
    createSlideshow(
      comparisonFrames,
      title,
      slideshowPath,
      FRAME_DURATION_SEC,
      REEL_WIDTH,
      REEL_HEIGHT,
    );
    slideshowPaths.push(slideshowPath);

    reelMeta.push({
      slug,
      title: slugToTitle(slug),
      hasBaseline,
      frameCount: FRAME_NAMES.length,
      sourceDurationSec: Number(durationSec.toFixed(2)),
    });
  }

  if (slideshowPaths.length === 0) {
    console.error("No slideshows were generated.");
    process.exit(1);
  }

  console.log("");
  console.log(`Concatenating ${slideshowPaths.length} demo slideshow(s)...`);

  // Concatenate all slideshows into the final reel.
  concatSegments(slideshowPaths, outputPath);

  const finalDuration = ffprobeDuration(outputPath);

  // Write metadata.
  const metaPath = outputPath.replace(/\.mp4$/, "-meta.json");
  const metaJson = {
    generatedAt: new Date().toISOString(),
    totalDurationSec: Number(finalDuration.toFixed(2)),
    frameDurationSec: FRAME_DURATION_SEC,
    framesPerDemo: FRAME_NAMES.length,
    demoCount: reelMeta.length,
    withBaseline: reelMeta.filter((m) => m.hasBaseline).length,
    withoutBaseline: reelMeta.filter((m) => !m.hasBaseline).length,
    demos: reelMeta,
  };

  await writeFile(metaPath, JSON.stringify(metaJson, null, 2) + "\n");

  // Clean up tmp dir.
  await rm(tmpDir, { recursive: true, force: true });

  console.log("");
  console.log(`Regression reel: ${path.relative(root, outputPath)}`);
  console.log(`Metadata:        ${path.relative(root, metaPath)}`);
  console.log(`Duration:        ${finalDuration.toFixed(1)}s`);
  console.log(
    `Demos:           ${reelMeta.length} (${metaJson.withBaseline} with baselines, ${metaJson.withoutBaseline} new)`,
  );
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
