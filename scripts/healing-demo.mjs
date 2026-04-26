#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const OUTPUT_BASE = path.join(ROOT, "output", "healing-demo");

const MUTATIONS = {
  "bad-selector": {
    label: "Wrong CSS selector (#task-input -> #task-field)",
    apply(yaml) {
      // Replace the first occurrence of #task-input with a selector that
      // does not exist in the todo-app DOM.
      return yaml.replaceAll("#task-input", "#task-field");
    },
    description: 'Changed selector "#task-input" to "#task-field" (element does not exist)',
    fix: 'Reverted selector back to "#task-input"',
  },
  "bad-action-target": {
    label: "Wrong button selector (#add-btn -> #submit-btn)",
    apply(yaml) {
      return yaml.replaceAll("#add-btn", "#submit-btn");
    },
    description: 'Changed selector "#add-btn" to "#submit-btn" (element does not exist)',
    fix: 'Reverted selector back to "#add-btn"',
  },
  "bad-filter-selector": {
    label: "Wrong filter attribute (data-filter -> data-tab)",
    apply(yaml) {
      return yaml.replaceAll("data-filter", "data-tab");
    },
    description: 'Changed attribute "data-filter" to "data-tab" in filter button selectors',
    fix: 'Reverted attribute back to "data-filter"',
  },
};

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    spec: "examples/showcase/todo-app.demo.yaml",
    mutation: "bad-selector",
    skipCapture: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--spec") {
      opts.spec = argv[++i] ?? opts.spec;
    } else if (a === "--mutation") {
      opts.mutation = argv[++i] ?? opts.mutation;
    } else if (a === "--skip-capture") {
      opts.skipCapture = true;
    } else if (a === "-h" || a === "--help") {
      opts.help = true;
    }
  }

  return opts;
}

function usage() {
  console.log(
    [
      "healing-demo — Before/after self-healing pipeline showcase",
      "",
      "Usage:",
      "  node scripts/healing-demo.mjs [options]",
      "",
      "Options:",
      "  --spec <path>        Spec to break and heal (default: examples/showcase/todo-app.demo.yaml)",
      "  --mutation <name>    Mutation to apply (default: bad-selector)",
      "                       Available: bad-selector, bad-action-target, bad-filter-selector",
      "  --skip-capture       Skip capture steps; generate video from existing artifacts",
      "  -h, --help           Show this help",
      "",
      "Output: output/healing-demo/",
      "  broken-spec.yaml     The mutated (broken) spec",
      "  healed-spec.yaml     The healed (original) spec",
      "  before/              Capture artifacts from the broken spec (failure.json, failure.png, ...)",
      "  after/               Capture artifacts from the healed spec (video.webm, events.json, ...)",
      "  healing-showcase.mp4 Comparison video: before failure vs after success",
      "  report.json          Summary report",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function exec(cmd, opts = {}) {
  const defaults = { cwd: ROOT, stdio: "inherit", shell: true };
  return execSync(cmd, { ...defaults, ...opts });
}

function execQuiet(cmd, opts = {}) {
  const defaults = { cwd: ROOT, stdio: "pipe", shell: true, encoding: "utf8" };
  return execSync(cmd, { ...defaults, ...opts });
}

function fileExists(p) {
  return existsSync(p);
}

function banner(text) {
  const line = "=".repeat(60);
  console.log(`\n${line}\n  ${text}\n${line}\n`);
}

// ---------------------------------------------------------------------------
// Step 1 — Create broken spec
// ---------------------------------------------------------------------------

function createBrokenSpec(specPath, mutation) {
  banner(`Step 1: Creating broken spec (mutation: ${mutation.label})`);

  const original = readFileSync(path.resolve(ROOT, specPath), "utf8");
  const broken = mutation.apply(original);

  const brokenPath = path.join(OUTPUT_BASE, "broken-spec.yaml");
  ensureDir(OUTPUT_BASE);
  writeFileSync(brokenPath, broken, "utf8");

  console.log(`  Original spec : ${specPath}`);
  console.log(`  Broken spec   : ${path.relative(ROOT, brokenPath)}`);
  console.log(`  Mutation      : ${mutation.description}`);

  return brokenPath;
}

// ---------------------------------------------------------------------------
// Step 2 — Capture failure (broken spec)
// ---------------------------------------------------------------------------

function captureFailure(brokenSpecPath) {
  banner("Step 2: Capturing with broken spec (expecting failure)");

  const beforeDir = path.join(OUTPUT_BASE, "before");
  ensureDir(beforeDir);

  const cmd = [
    "node",
    "dist/cli.js",
    "capture",
    JSON.stringify(brokenSpecPath),
    "--output",
    JSON.stringify(beforeDir),
    "--overwrite",
    "--no-narration",
  ].join(" ");

  try {
    exec(cmd);
    // If capture somehow succeeds, that is unexpected but not fatal.
    console.log("  WARNING: Capture succeeded — the mutation may not have broken the spec.");
  } catch {
    console.log("  Capture failed as expected (broken selector).");
  }

  // Check for failure artifacts.
  const failureJson = path.join(beforeDir, "failure.json");
  const failurePng = path.join(beforeDir, "failure.png");
  const failureHtml = path.join(beforeDir, "failure.html");

  console.log(`  failure.json : ${fileExists(failureJson) ? "present" : "MISSING"}`);
  console.log(`  failure.png  : ${fileExists(failurePng) ? "present" : "MISSING"}`);
  console.log(`  failure.html : ${fileExists(failureHtml) ? "present" : "MISSING"}`);

  return { failureJson, failurePng, failureHtml, beforeDir };
}

// ---------------------------------------------------------------------------
// Step 3 — Create healed spec
// ---------------------------------------------------------------------------

function createHealedSpec(specPath) {
  banner("Step 3: Creating healed spec (restoring original)");

  const original = readFileSync(path.resolve(ROOT, specPath), "utf8");
  const healedPath = path.join(OUTPUT_BASE, "healed-spec.yaml");
  writeFileSync(healedPath, original, "utf8");

  console.log(`  Healed spec: ${path.relative(ROOT, healedPath)}`);
  console.log("  (In production, heal-spec would analyze failure.json + failure.html");
  console.log("   and use AI to fix the broken selectors automatically.)");

  return healedPath;
}

// ---------------------------------------------------------------------------
// Step 4 — Capture success (healed spec)
// ---------------------------------------------------------------------------

function captureSuccess(healedSpecPath) {
  banner("Step 4: Capturing with healed spec");

  const afterDir = path.join(OUTPUT_BASE, "after");
  ensureDir(afterDir);

  const cmd = [
    "node",
    "dist/cli.js",
    "capture",
    JSON.stringify(healedSpecPath),
    "--output",
    JSON.stringify(afterDir),
    "--overwrite",
    "--no-narration",
  ].join(" ");

  try {
    exec(cmd);
    console.log("  Capture succeeded.");
  } catch (err) {
    console.error("  ERROR: Healed spec capture failed unexpectedly.");
    throw err;
  }

  // Find the output video — capture produces video.webm.
  const videoWebm = path.join(afterDir, "video.webm");
  const eventsJson = path.join(afterDir, "events.json");

  console.log(`  video.webm   : ${fileExists(videoWebm) ? "present" : "MISSING"}`);
  console.log(`  events.json  : ${fileExists(eventsJson) ? "present" : "MISSING"}`);

  return { afterDir, videoWebm, eventsJson };
}

// ---------------------------------------------------------------------------
// Step 5 — Generate comparison video with ffmpeg
// ---------------------------------------------------------------------------

function generateComparisonVideo({ failurePng, videoWebm, mutation }) {
  banner("Step 5: Generating comparison video (healing-showcase.mp4)");

  const tmpDir = path.join(OUTPUT_BASE, "tmp-ffmpeg");
  ensureDir(tmpDir);

  const beforeTitle = path.join(tmpDir, "before-title.mp4");
  const failureSegment = path.join(tmpDir, "failure-segment.mp4");
  const afterTitle = path.join(tmpDir, "after-title.mp4");
  const successSegment = path.join(tmpDir, "success-segment.mp4");
  const concatList = path.join(tmpDir, "concat.txt");
  const showcase = path.join(OUTPUT_BASE, "healing-showcase.mp4");

  // Escape colons and backslashes for ffmpeg drawtext on Windows.
  const escapeDrawtext = (s) => s.replaceAll("\\", "\\\\").replaceAll(":", "\\:");

  // --- Part 1: "BEFORE: Broken Selector" title card (5s) ---
  const beforeText = escapeDrawtext(`BEFORE: ${mutation.label}`);
  const subtitleBefore = escapeDrawtext(mutation.description);
  exec(
    [
      "ffmpeg -y -hide_banner -loglevel error",
      "-f lavfi -i color=c=#1a1a2e:s=1280x720:d=5:r=30",
      `-vf "drawtext=text='${beforeText}':fontsize=42:fontcolor=#ff4444:x=(w-text_w)/2:y=(h-text_h)/2-30,drawtext=text='${subtitleBefore}':fontsize=24:fontcolor=#aaaaaa:x=(w-text_w)/2:y=(h-text_h)/2+40"`,
      "-c:v libx264 -pix_fmt yuv420p -r 30",
      JSON.stringify(beforeTitle),
    ].join(" "),
  );
  console.log("  Created before-title.mp4");

  // --- Part 2: failure.png displayed for 3s with red border ---
  if (fileExists(failurePng)) {
    exec(
      [
        "ffmpeg -y -hide_banner -loglevel error",
        `-loop 1 -i ${JSON.stringify(failurePng)}`,
        "-t 3 -r 30",
        '-vf "scale=1200:680:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=#cc0000"',
        "-c:v libx264 -pix_fmt yuv420p",
        JSON.stringify(failureSegment),
      ].join(" "),
    );
    console.log("  Created failure-segment.mp4 (from failure.png)");
  } else {
    // Fallback: red screen with error text if no screenshot.
    exec(
      [
        "ffmpeg -y -hide_banner -loglevel error",
        "-f lavfi -i color=c=#cc0000:s=1280x720:d=3:r=30",
        `-vf "drawtext=text='Capture failed (no screenshot)':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2"`,
        "-c:v libx264 -pix_fmt yuv420p",
        JSON.stringify(failureSegment),
      ].join(" "),
    );
    console.log("  Created failure-segment.mp4 (fallback — no screenshot)");
  }

  // --- Part 3: "AFTER: Healed Spec" title card (5s) ---
  const afterText = escapeDrawtext("AFTER: Healed Spec");
  const subtitleAfter = escapeDrawtext(mutation.fix);
  exec(
    [
      "ffmpeg -y -hide_banner -loglevel error",
      "-f lavfi -i color=c=#0d1117:s=1280x720:d=5:r=30",
      `-vf "drawtext=text='${afterText}':fontsize=42:fontcolor=#44ff44:x=(w-text_w)/2:y=(h-text_h)/2-30,drawtext=text='${subtitleAfter}':fontsize=24:fontcolor=#aaaaaa:x=(w-text_w)/2:y=(h-text_h)/2+40"`,
      "-c:v libx264 -pix_fmt yuv420p -r 30",
      JSON.stringify(afterTitle),
    ].join(" "),
  );
  console.log("  Created after-title.mp4");

  // --- Part 4: First 10s of successful capture ---
  if (fileExists(videoWebm)) {
    exec(
      [
        "ffmpeg -y -hide_banner -loglevel error",
        `-i ${JSON.stringify(videoWebm)}`,
        "-t 10 -r 30",
        '-vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=#0d1117"',
        "-c:v libx264 -pix_fmt yuv420p",
        JSON.stringify(successSegment),
      ].join(" "),
    );
    console.log("  Created success-segment.mp4 (first 10s of capture)");
  } else {
    // Fallback: green screen with success text.
    exec(
      [
        "ffmpeg -y -hide_banner -loglevel error",
        "-f lavfi -i color=c=#0d1117:s=1280x720:d=10:r=30",
        `-vf "drawtext=text='Capture succeeded (video not found for preview)':fontsize=30:fontcolor=#44ff44:x=(w-text_w)/2:y=(h-text_h)/2"`,
        "-c:v libx264 -pix_fmt yuv420p",
        JSON.stringify(successSegment),
      ].join(" "),
    );
    console.log("  Created success-segment.mp4 (fallback — no video)");
  }

  // --- Concatenate all parts ---
  const concatContent = [beforeTitle, failureSegment, afterTitle, successSegment]
    .map((p) => `file '${p.replaceAll("\\", "/")}'`)
    .join("\n");
  writeFileSync(concatList, concatContent, "utf8");

  exec(
    [
      "ffmpeg -y -hide_banner -loglevel error",
      `-f concat -safe 0 -i ${JSON.stringify(concatList)}`,
      "-c:v libx264 -pix_fmt yuv420p -movflags +faststart",
      JSON.stringify(showcase),
    ].join(" "),
  );

  console.log(`\n  Output: ${path.relative(ROOT, showcase)}`);
  return showcase;
}

// ---------------------------------------------------------------------------
// Step 6 — Generate report
// ---------------------------------------------------------------------------

function generateReport({ specPath, mutation, failureJsonPath, afterDir, showcasePath }) {
  banner("Step 6: Generating report");

  let failureMessage = "(no failure.json found)";
  if (fileExists(failureJsonPath)) {
    try {
      const raw = JSON.parse(readFileSync(failureJsonPath, "utf8"));
      failureMessage = raw.message ?? "(no message in failure.json)";
    } catch {
      failureMessage = "(could not parse failure.json)";
    }
  }

  const verificationPath = path.join(afterDir, "verification.json");
  let successVerified = false;
  if (fileExists(verificationPath)) {
    try {
      const raw = JSON.parse(readFileSync(verificationPath, "utf8"));
      successVerified = raw.status === "passed";
    } catch {
      // ignore
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    spec: specPath,
    mutation: {
      name: mutation.label,
      description: mutation.description,
    },
    before: {
      status: "failed",
      failureMessage,
      artifacts: {
        failureJson: fileExists(failureJsonPath),
        failurePng: fileExists(path.join(OUTPUT_BASE, "before", "failure.png")),
        failureHtml: fileExists(path.join(OUTPUT_BASE, "before", "failure.html")),
      },
    },
    after: {
      status: successVerified ? "passed" : "unknown",
      fix: mutation.fix,
      artifacts: {
        videoWebm: fileExists(path.join(afterDir, "video.webm")),
        eventsJson: fileExists(path.join(afterDir, "events.json")),
        verificationJson: fileExists(verificationPath),
      },
    },
    showcaseVideo: path.relative(ROOT, showcasePath),
    healingPipeline: {
      note: "In production, the heal-spec MCP prompt analyzes failure.json + failure.html + failure.png to generate a fixed spec automatically.",
      steps: [
        "1. Capture fails -> writes failure.json, failure.png, failure.html",
        "2. heal-spec prompt reads failure artifacts + page DOM",
        "3. AI identifies broken selector and finds correct element",
        "4. Fixed spec is written and re-captured",
        "5. Success artifacts (video.webm, events.json, verification.json) confirm the fix",
      ],
    },
  };

  const reportPath = path.join(OUTPUT_BASE, "report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`  Report: ${path.relative(ROOT, reportPath)}`);
  console.log(`  Before: ${report.before.status} — ${failureMessage}`);
  console.log(`  After : ${report.after.status}`);

  return report;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    usage();
    process.exit(0);
  }

  // Validate mutation choice.
  const mutation = MUTATIONS[opts.mutation];
  if (!mutation) {
    console.error(
      `Unknown mutation: "${opts.mutation}". Available: ${Object.keys(MUTATIONS).join(", ")}`,
    );
    process.exit(2);
  }

  // Validate spec exists.
  const specAbsolute = path.resolve(ROOT, opts.spec);
  if (!fileExists(specAbsolute)) {
    console.error(`Spec not found: ${specAbsolute}`);
    process.exit(2);
  }

  banner(`Healing Demo — spec: ${opts.spec}, mutation: ${opts.mutation}`);

  ensureDir(OUTPUT_BASE);

  // Check ffmpeg is available.
  try {
    execQuiet("ffmpeg -version");
  } catch {
    console.error("ffmpeg is required on PATH. Install it and try again.");
    process.exit(2);
  }

  // Ensure project is built.
  if (!opts.skipCapture) {
    const distCli = path.join(ROOT, "dist", "cli.js");
    if (!fileExists(distCli)) {
      banner("Building project (dist/cli.js not found)");
      exec("pnpm -s build");
    }
  }

  // Step 1: Create broken spec.
  const brokenSpecPath = createBrokenSpec(opts.spec, mutation);

  // Step 2: Capture with broken spec (expected failure).
  let failureArtifacts;
  if (!opts.skipCapture) {
    failureArtifacts = captureFailure(brokenSpecPath);
  } else {
    console.log("\n  [--skip-capture] Skipping broken capture");
    failureArtifacts = {
      failureJson: path.join(OUTPUT_BASE, "before", "failure.json"),
      failurePng: path.join(OUTPUT_BASE, "before", "failure.png"),
      failureHtml: path.join(OUTPUT_BASE, "before", "failure.html"),
      beforeDir: path.join(OUTPUT_BASE, "before"),
    };
  }

  // Step 3: Create healed spec.
  const healedSpecPath = createHealedSpec(opts.spec);

  // Step 4: Capture with healed spec.
  let afterArtifacts;
  if (!opts.skipCapture) {
    afterArtifacts = captureSuccess(healedSpecPath);
  } else {
    console.log("\n  [--skip-capture] Skipping healed capture");
    afterArtifacts = {
      afterDir: path.join(OUTPUT_BASE, "after"),
      videoWebm: path.join(OUTPUT_BASE, "after", "video.webm"),
      eventsJson: path.join(OUTPUT_BASE, "after", "events.json"),
    };
  }

  // Step 5: Generate comparison video.
  const showcasePath = generateComparisonVideo({
    failurePng: failureArtifacts.failurePng,
    videoWebm: afterArtifacts.videoWebm,
    mutation,
  });

  // Step 6: Generate report.
  const report = generateReport({
    specPath: opts.spec,
    mutation,
    failureJsonPath: failureArtifacts.failureJson,
    afterDir: afterArtifacts.afterDir,
    showcasePath,
  });

  // Summary.
  banner("Done");
  console.log(`  Showcase video : ${path.relative(ROOT, showcasePath)}`);
  console.log(`  Report         : output/healing-demo/report.json`);
  console.log(`  Before status  : ${report.before.status}`);
  console.log(`  After status   : ${report.after.status}`);
  console.log();
}

main();
