#!/usr/bin/env node
/**
 * golden-frames.mjs — Extract key frames from demo MP4s for visual regression testing.
 *
 * Usage:
 *   node scripts/golden-frames.mjs                        # Extract baselines
 *   node scripts/golden-frames.mjs --compare              # Compare current vs baselines
 *   node scripts/golden-frames.mjs --update               # Overwrite baselines with current
 *   node scripts/golden-frames.mjs --filter <slug>        # Process a single demo
 *   node scripts/golden-frames.mjs --threshold 3          # Custom diff threshold (default 2%)
 *   node scripts/golden-frames.mjs --help
 *
 * Requires ffmpeg and ffprobe on PATH.
 * Uses pixelmatch + pngjs (peer dependencies) for --compare mode.
 */
import { execSync } from "node:child_process";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    compare: false,
    update: false,
    filter: null,
    threshold: 2,
    captureDir: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--compare") {
      opts.compare = true;
    } else if (a === "--update") {
      opts.update = true;
    } else if (a === "--filter") {
      opts.filter = argv[++i] ?? null;
    } else if (a === "--threshold") {
      const raw = argv[++i];
      opts.threshold = raw ? Number(raw) : opts.threshold;
    } else if (a === "--capture-dir") {
      opts.captureDir = argv[++i] ?? null;
    } else if (a === "-h" || a === "--help") {
      opts.help = true;
    }
  }

  return opts;
}

function usage() {
  console.log(
    [
      "golden-frames — Extract key frames from demo MP4s for visual regression",
      "",
      "Usage:",
      "  node scripts/golden-frames.mjs [options]",
      "",
      "Modes:",
      "  (default)    Extract frames and save as baselines",
      "  --compare    Extract frames from current output, compare against baselines",
      "  --update     Overwrite baselines with frames from current output",
      "",
      "Options:",
      "  --filter <slug>        Process only demos matching this substring",
      "  --threshold <percent>  Max allowed pixel diff percentage (default: 2)",
      "  --capture-dir <dir>    Override capture output root (default: output/example-suite)",
      "  -h, --help             Show this help message",
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
 * Extract a single frame from an MP4 as a PNG.
 */
function extractFrame(mp4Path, timeSec, outPath) {
  execSync(
    `ffmpeg -y -hide_banner -loglevel error -ss ${timeSec.toFixed(3)} -i "${mp4Path}" -frames:v 1 -q:v 2 "${outPath}"`,
  );
}

/**
 * Compute the five key timestamps for a given duration:
 *   0s, 25%, 50%, 75%, last-second
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    usage();
    process.exit(0);
  }

  if (!Number.isFinite(opts.threshold) || opts.threshold < 0) {
    console.error(`Invalid --threshold: ${String(opts.threshold)}`);
    process.exit(2);
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, "..");
  const captureRoot = opts.captureDir
    ? path.resolve(opts.captureDir)
    : path.join(root, "output", "example-suite");
  const baselinesRoot = path.join(root, "baselines", "golden-frames");

  // Verify ffmpeg + ffprobe are available.
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    execSync("ffprobe -version", { stdio: "ignore" });
  } catch {
    console.error("Error: ffmpeg and ffprobe are required on PATH.");
    process.exit(2);
  }

  if (!(await fileExists(captureRoot))) {
    console.error(`Error: capture directory does not exist: ${captureRoot}`);
    process.exit(1);
  }

  // Discover demo directories with an output.mp4
  const entries = await readdir(captureRoot, { withFileTypes: true });
  let slugs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  if (opts.filter) {
    const f = opts.filter.toLowerCase();
    slugs = slugs.filter((s) => s.toLowerCase().includes(f));
  }

  // Filter to only those with output.mp4
  const demos = [];
  for (const slug of slugs) {
    const mp4 = path.join(captureRoot, slug, "output.mp4");
    if (await fileExists(mp4)) {
      demos.push({ slug, mp4 });
    }
  }

  if (demos.length === 0) {
    console.error("No demos with output.mp4 found.");
    process.exit(1);
  }

  console.log(`Found ${demos.length} demo(s) with output.mp4`);
  console.log(`Baselines dir: ${baselinesRoot}`);
  console.log(`Mode: ${opts.compare ? "compare" : opts.update ? "update" : "extract"}`);
  console.log("");

  // --compare mode: extract to temp dir, compare against baselines
  if (opts.compare) {
    const require = createRequire(import.meta.url);
    let PNG, pixelmatch;
    try {
      PNG = require("pngjs").PNG;
      pixelmatch = require("pixelmatch").default ?? require("pixelmatch");
    } catch {
      console.error("Error: pixelmatch and pngjs are required for --compare mode.");
      console.error("Install them: pnpm add -D pixelmatch pngjs");
      process.exit(2);
    }

    let failures = 0;
    let total = 0;
    const results = [];

    for (const { slug, mp4 } of demos) {
      const baselineDir = path.join(baselinesRoot, slug);
      if (!(await fileExists(baselineDir))) {
        console.log(`  SKIP  ${slug} — no baseline (run without --compare first)`);
        continue;
      }

      const durationSec = ffprobeDuration(mp4);
      const times = keyTimestamps(durationSec);

      // Use a temp dir for current frames
      const tmpDir = path.join(root, "output", ".golden-frames-tmp", slug);
      await mkdir(tmpDir, { recursive: true });

      const demoResults = [];
      for (let i = 0; i < FRAME_NAMES.length; i++) {
        const frameName = FRAME_NAMES[i];
        const currentPath = path.join(tmpDir, frameName);
        const baselinePath = path.join(baselineDir, frameName);

        extractFrame(mp4, times[i], currentPath);
        total++;

        if (!(await fileExists(baselinePath))) {
          console.log(`  MISS  ${slug}/${frameName} — baseline missing`);
          failures++;
          demoResults.push({ frame: frameName, status: "missing" });
          continue;
        }

        const currentBuf = await readFile(currentPath);
        const baselineBuf = await readFile(baselinePath);

        const a = PNG.sync.read(currentBuf);
        const b = PNG.sync.read(baselineBuf);

        if (a.width !== b.width || a.height !== b.height) {
          const msg = `dimension mismatch: current ${a.width}x${a.height} vs baseline ${b.width}x${b.height}`;
          console.log(`  FAIL  ${slug}/${frameName} — ${msg}`);
          failures++;
          demoResults.push({ frame: frameName, status: "fail", reason: msg });
          continue;
        }

        const totalPixels = a.width * a.height;
        const mismatchCount = pixelmatch(a.data, b.data, null, a.width, a.height, {
          threshold: 0.1,
        });
        const diffPercent = totalPixels > 0 ? (mismatchCount / totalPixels) * 100 : 0;
        const pass = diffPercent <= opts.threshold;

        const tag = pass ? "PASS" : "FAIL";
        console.log(`  ${tag}  ${slug}/${frameName} — ${diffPercent.toFixed(2)}% diff`);

        if (!pass) failures++;
        demoResults.push({
          frame: frameName,
          status: pass ? "pass" : "fail",
          diffPercent: Number(diffPercent.toFixed(2)),
        });
      }

      results.push({ slug, frames: demoResults });
    }

    console.log("");
    console.log(`Compared ${total} frame(s) across ${demos.length} demo(s).`);
    if (failures > 0) {
      console.log(`${failures} frame(s) exceeded the ${opts.threshold}% threshold.`);
      process.exit(1);
    } else {
      console.log("All frames within threshold.");
    }
    return;
  }

  // --update or default extract mode: extract frames and save to baselines
  const targetRoot = baselinesRoot;
  let extracted = 0;

  for (const { slug, mp4 } of demos) {
    const outDir = path.join(targetRoot, slug);
    await mkdir(outDir, { recursive: true });

    const durationSec = ffprobeDuration(mp4);
    const times = keyTimestamps(durationSec);

    for (let i = 0; i < FRAME_NAMES.length; i++) {
      const frameName = FRAME_NAMES[i];
      const outPath = path.join(outDir, frameName);

      // In default mode, skip if baseline already exists (use --update to overwrite)
      if (!opts.update && (await fileExists(outPath))) {
        continue;
      }

      extractFrame(mp4, times[i], outPath);
      extracted++;
    }

    const label = FRAME_NAMES.map((_, i) => times[i].toFixed(1) + "s").join(", ");
    console.log(`  ${slug} — ${durationSec.toFixed(1)}s duration [${label}]`);
  }

  console.log("");
  console.log(
    `${opts.update ? "Updated" : "Extracted"} ${extracted} frame(s) across ${demos.length} demo(s).`,
  );
  console.log(`Baselines saved to: ${path.relative(root, targetRoot)}`);
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
