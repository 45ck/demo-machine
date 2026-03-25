#!/usr/bin/env node
/**
 * visual-diff-gate.mjs — Visual regression gate for demo captures.
 *
 * Extracts key frames from rendered MP4s and compares them against golden-frame
 * baselines using pixelmatch. Reports pixel-level regressions per frame and per
 * demo.
 *
 * Usage:
 *   node scripts/visual-diff-gate.mjs [options]
 *   node scripts/visual-diff-gate.mjs --threshold 3 --filter spa-router
 *   node scripts/visual-diff-gate.mjs --update-baselines
 *   node scripts/visual-diff-gate.mjs --help
 *
 * Exit codes:
 *   0 — pass (all frames within threshold)
 *   1 — regression detected (at least one frame exceeds threshold)
 *   2 — usage error
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
    outputDir: null,
    baselineDir: null,
    threshold: 2,
    filter: null,
    updateBaselines: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--output-dir") {
      opts.outputDir = argv[++i] ?? null;
    } else if (a === "--baseline-dir") {
      opts.baselineDir = argv[++i] ?? null;
    } else if (a === "--threshold") {
      const raw = argv[++i];
      opts.threshold = raw ? Number(raw) : opts.threshold;
    } else if (a === "--filter") {
      opts.filter = argv[++i] ?? null;
    } else if (a === "--update-baselines") {
      opts.updateBaselines = true;
    } else if (a === "-h" || a === "--help") {
      opts.help = true;
    }
  }

  return opts;
}

function usage() {
  console.log(
    [
      "visual-diff-gate — Visual regression gate for demo captures",
      "",
      "Usage:",
      "  node scripts/visual-diff-gate.mjs [options]",
      "",
      "Options:",
      "  --output-dir <dir>     Capture output root (default: output/example-suite)",
      "  --baseline-dir <dir>   Golden-frame baselines (default: baselines/golden-frames)",
      "  --threshold <percent>  Max allowed pixel diff percentage (default: 2)",
      "  --filter <slug>        Process only demos matching this substring",
      "  --update-baselines     Copy current frames to baselines (overwrite)",
      "  -h, --help             Show this help message",
      "",
      "Exit codes:",
      "  0  All frames within threshold (pass)",
      "  1  Visual regression detected",
      "  2  Usage error",
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
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${mp4Path}"`,
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
 * Matches the positions used by golden-frames.mjs.
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
 * Compare two PNG buffers using pixelmatch and return diff percentage.
 */
function compareFrames(PNG, pixelmatch, currentBuf, baselineBuf) {
  const a = PNG.sync.read(currentBuf);
  const b = PNG.sync.read(baselineBuf);

  if (a.width !== b.width || a.height !== b.height) {
    return {
      diffPercent: 100,
      mismatchCount: Math.max(a.width * a.height, b.width * b.height),
      totalPixels: Math.max(a.width * a.height, b.width * b.height),
      dimensionMismatch: true,
      currentDimensions: `${a.width}x${a.height}`,
      baselineDimensions: `${b.width}x${b.height}`,
    };
  }

  const totalPixels = a.width * a.height;
  if (totalPixels === 0) {
    return { diffPercent: 0, mismatchCount: 0, totalPixels: 0 };
  }

  const mismatchCount = pixelmatch(a.data, b.data, null, a.width, a.height, {
    threshold: 0.1,
  });
  const diffPercent = (mismatchCount / totalPixels) * 100;

  return { diffPercent, mismatchCount, totalPixels };
}

/**
 * Pad a string to a fixed width (right-padded).
 */
function pad(str, width) {
  return String(str).padEnd(width);
}

/**
 * Format a percentage for display.
 */
function fmtPct(n) {
  return n.toFixed(2) + "%";
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

  if (!Number.isFinite(opts.threshold) || opts.threshold < 0) {
    console.error(`Error: invalid --threshold: ${String(opts.threshold)}`);
    process.exit(2);
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, "..");
  const outputDir = opts.outputDir
    ? path.resolve(opts.outputDir)
    : path.join(root, "output", "example-suite");
  const baselineDir = opts.baselineDir
    ? path.resolve(opts.baselineDir)
    : path.join(root, "baselines", "golden-frames");

  // Verify ffmpeg + ffprobe are available.
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    execSync("ffprobe -version", { stdio: "ignore" });
  } catch {
    console.error("Error: ffmpeg and ffprobe are required on PATH.");
    process.exit(2);
  }

  if (!(await fileExists(outputDir))) {
    console.error(`Error: output directory does not exist: ${outputDir}`);
    process.exit(1);
  }

  // Load pixelmatch + pngjs
  const require = createRequire(import.meta.url);
  let PNG, pixelmatch;
  try {
    PNG = require("pngjs").PNG;
    pixelmatch = require("pixelmatch").default ?? require("pixelmatch");
  } catch {
    console.error("Error: pixelmatch and pngjs are required.");
    console.error("Install them: pnpm add -D pixelmatch pngjs");
    process.exit(2);
  }

  // Discover demo directories with an output.mp4
  const entries = await readdir(outputDir, { withFileTypes: true });
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
    const mp4 = path.join(outputDir, slug, "output.mp4");
    if (await fileExists(mp4)) {
      demos.push({ slug, mp4 });
    }
  }

  if (demos.length === 0) {
    console.error("No demos with output.mp4 found.");
    process.exit(1);
  }

  console.log(`Visual diff gate`);
  console.log(`  Output dir:   ${outputDir}`);
  console.log(`  Baseline dir: ${baselineDir}`);
  console.log(`  Threshold:    ${opts.threshold}%`);
  console.log(`  Demos found:  ${demos.length}`);
  console.log("");

  // --update-baselines mode: extract frames and copy to baselines
  if (opts.updateBaselines) {
    let extracted = 0;
    for (const { slug, mp4 } of demos) {
      const outDir = path.join(baselineDir, slug);
      await mkdir(outDir, { recursive: true });

      const durationSec = ffprobeDuration(mp4);
      const times = keyTimestamps(durationSec);

      for (let i = 0; i < FRAME_NAMES.length; i++) {
        const frameName = FRAME_NAMES[i];
        const outPath = path.join(outDir, frameName);
        extractFrame(mp4, times[i], outPath);
        extracted++;
      }

      const label = times.map((t) => t.toFixed(1) + "s").join(", ");
      console.log(`  ${slug} -- ${durationSec.toFixed(1)}s [${label}]`);
    }

    console.log("");
    console.log(`Updated ${extracted} frame(s) across ${demos.length} demo(s).`);
    console.log(`Baselines saved to: ${path.relative(root, baselineDir)}`);
    process.exit(0);
  }

  // --- Compare mode (default) ---

  // Create temp dir for extracted frames
  const tempRoot = path.join(root, "output", ".visual-diff-tmp");
  await mkdir(tempRoot, { recursive: true });

  const report = {
    status: "pass",
    threshold: opts.threshold,
    demos: [],
    summary: {
      totalDemos: demos.length,
      demosWithRegression: 0,
      demosUnchanged: 0,
      demosMissingBaseline: 0,
      totalFrames: 0,
      framesExceedingThreshold: 0,
    },
  };

  // Console table header
  console.log(`  ${pad("DEMO", 36)} ${pad("FRAME", 14)} ${pad("DIFF %", 10)} ${pad("STATUS", 8)}`);
  console.log("  " + "-".repeat(70));

  for (const { slug, mp4 } of demos) {
    const baseSlugDir = path.join(baselineDir, slug);
    const hasBaseline = await fileExists(baseSlugDir);

    if (!hasBaseline) {
      report.summary.demosMissingBaseline++;
      report.demos.push({
        slug,
        status: "missing-baseline",
        frames: [],
        maxDiffPercent: null,
        avgDiffPercent: null,
      });
      console.log(`  ${pad(slug, 36)} ${pad("--", 14)} ${pad("--", 10)} SKIP`);
      continue;
    }

    // Extract frames from current MP4
    const tmpDir = path.join(tempRoot, slug);
    await mkdir(tmpDir, { recursive: true });

    const durationSec = ffprobeDuration(mp4);
    const times = keyTimestamps(durationSec);

    const frameResults = [];
    let maxDiff = 0;
    let sumDiff = 0;
    let demoRegression = false;

    for (let i = 0; i < FRAME_NAMES.length; i++) {
      const frameName = FRAME_NAMES[i];
      const currentPath = path.join(tmpDir, frameName);
      const baselinePath = path.join(baseSlugDir, frameName);

      extractFrame(mp4, times[i], currentPath);
      report.summary.totalFrames++;

      if (!(await fileExists(baselinePath))) {
        frameResults.push({ frame: frameName, status: "missing", diffPercent: null });
        console.log(`  ${pad(slug, 36)} ${pad(frameName, 14)} ${pad("--", 10)} MISS`);
        continue;
      }

      const currentBuf = await readFile(currentPath);
      const baselineBuf = await readFile(baselinePath);

      const result = compareFrames(PNG, pixelmatch, currentBuf, baselineBuf);
      const diffPct = Number(result.diffPercent.toFixed(2));
      const pass = diffPct <= opts.threshold;

      if (!pass) {
        demoRegression = true;
        report.summary.framesExceedingThreshold++;
      }

      maxDiff = Math.max(maxDiff, diffPct);
      sumDiff += diffPct;

      const frameEntry = {
        frame: frameName,
        status: pass ? "pass" : "regression",
        diffPercent: diffPct,
      };

      if (result.dimensionMismatch) {
        frameEntry.dimensionMismatch = true;
        frameEntry.currentDimensions = result.currentDimensions;
        frameEntry.baselineDimensions = result.baselineDimensions;
      }

      frameResults.push(frameEntry);

      const tag = pass ? "PASS" : "FAIL";
      console.log(`  ${pad(slug, 36)} ${pad(frameName, 14)} ${pad(fmtPct(diffPct), 10)} ${tag}`);
    }

    const validFrames = frameResults.filter((f) => f.diffPercent != null);
    const avgDiff =
      validFrames.length > 0 ? Number((sumDiff / validFrames.length).toFixed(2)) : null;

    if (demoRegression) {
      report.summary.demosWithRegression++;
    } else {
      report.summary.demosUnchanged++;
    }

    report.demos.push({
      slug,
      status: demoRegression ? "regression" : "pass",
      frames: frameResults,
      maxDiffPercent: Number(maxDiff.toFixed(2)),
      avgDiffPercent: avgDiff,
    });
  }

  // Overall status
  if (report.summary.demosWithRegression > 0) {
    report.status = "regression";
  }

  // Console summary
  console.log("");
  console.log("  " + "=".repeat(70));
  console.log(`  Summary:`);
  console.log(`    Total demos:          ${report.summary.totalDemos}`);
  console.log(`    Unchanged:            ${report.summary.demosUnchanged}`);
  console.log(`    Regressions:          ${report.summary.demosWithRegression}`);
  console.log(`    Missing baseline:     ${report.summary.demosMissingBaseline}`);
  console.log(`    Total frames:         ${report.summary.totalFrames}`);
  console.log(`    Frames > threshold:   ${report.summary.framesExceedingThreshold}`);
  console.log(`    Status:               ${report.status.toUpperCase()}`);
  console.log("");

  // Write report JSON
  const reportPath = path.join(root, "output", "visual-diff-report.json");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`  Report written to: ${path.relative(root, reportPath)}`);

  process.exit(report.status === "pass" ? 0 : 1);
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(2);
});
