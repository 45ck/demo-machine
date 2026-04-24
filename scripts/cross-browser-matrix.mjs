#!/usr/bin/env node
/**
 * cross-browser-matrix.mjs — Multi-browser capture comparison.
 *
 * Runs captures across multiple Playwright browsers (chromium, firefox, webkit)
 * and compares the resulting events.json structurally.
 *
 * LIMITATION: demo-machine CLI does not currently support a --browser flag.
 * Browser selection relies on Playwright's BROWSER environment variable.
 * Chromium is the default and most reliable; Firefox and WebKit support
 * depends on Playwright browser installation and platform compatibility.
 *
 * Usage:
 *   node scripts/cross-browser-matrix.mjs
 *   node scripts/cross-browser-matrix.mjs --specs todo-app,hello-world
 *   node scripts/cross-browser-matrix.mjs --browsers chromium,firefox
 *   node scripts/cross-browser-matrix.mjs --skip-capture   (compare existing output only)
 *
 * Output:
 *   output/cross-browser/{slug}-{browser}/  — capture artifacts
 *   output/cross-browser/report.json        — comparison report
 */
import { spawn } from "node:child_process";
import { readFile, readdir, mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

// PR-tier specs from manifest.json
const DEFAULT_SPECS = ["hello-world", "todo-app", "spa-router", "controls-lab", "seeded-api"];
const DEFAULT_BROWSERS = ["chromium", "firefox"];

function parseArgs(argv) {
  const opts = {
    specs: null,
    browsers: null,
    skipCapture: false,
    build: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--specs") {
      opts.specs = (argv[++i] ?? "").split(",").filter(Boolean);
    } else if (a === "--browsers") {
      opts.browsers = (argv[++i] ?? "").split(",").filter(Boolean);
    } else if (a === "--skip-capture") {
      opts.skipCapture = true;
    } else if (a === "--no-build") {
      opts.build = false;
    } else if (a === "-h" || a === "--help") {
      opts.help = true;
    }
  }
  return opts;
}

function usage() {
  console.log(
    [
      "cross-browser-matrix — Multi-browser capture comparison",
      "",
      "Usage:",
      "  node scripts/cross-browser-matrix.mjs [--specs <slugs>] [--browsers <list>]",
      "",
      "Options:",
      "  --specs <slugs>      Comma-separated spec slugs (default: PR-tier demos)",
      "  --browsers <list>    Comma-separated browsers (default: chromium,firefox)",
      "  --skip-capture       Skip capture, compare existing output only",
      "  --no-build           Skip pnpm build step",
      "  -h, --help           Show this help message",
      "",
      "NOTE: demo-machine CLI does not have a --browser flag.",
      "Browser selection uses the BROWSER environment variable for Playwright.",
      "Ensure browsers are installed: npx playwright install chromium firefox webkit",
      "",
      "Output:",
      "  output/cross-browser/{slug}-{browser}/  per-capture artifacts",
      "  output/cross-browser/report.json         structural comparison",
    ].join("\n"),
  );
}

function resolveCommand(cmd) {
  if (process.platform !== "win32") return cmd;
  if (cmd === "pnpm") return "pnpm.cmd";
  if (cmd === "node") return "node.exe";
  return cmd;
}

function run(cmd, args, { cwd, env } = { cwd: root, env: process.env }) {
  return new Promise((resolve) => {
    const child = spawn(resolveCommand(cmd), args, {
      cwd: cwd ?? root,
      env: env ?? process.env,
      stdio: "inherit",
      shell: false,
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveSpecPath(slug) {
  const examplesDir = path.join(root, "examples");
  const candidates = [`${slug}.demo.yaml`, `${slug}.demo.yml`];
  for (const name of candidates) {
    const p = path.join(examplesDir, name);
    if (await exists(p)) return p;
  }
  return null;
}

function extractActionSequence(events) {
  return events.map((e) => ({
    action: e.action,
    selector: e.selector ?? null,
    hasBoundingBox: !!e.boundingBox,
    durationMs: e.duration ?? 0,
  }));
}

function diffActionSequences(seqA, seqB) {
  const diffs = [];
  const maxLen = Math.max(seqA.length, seqB.length);

  if (seqA.length !== seqB.length) {
    diffs.push({
      type: "count-mismatch",
      message: `Action count differs: ${seqA.length} vs ${seqB.length}`,
    });
  }

  for (let i = 0; i < maxLen; i++) {
    const a = seqA[i];
    const b = seqB[i];

    if (!a) {
      diffs.push({ type: "extra-action", index: i, message: `Extra action in B: ${b.action}` });
      continue;
    }
    if (!b) {
      diffs.push({ type: "extra-action", index: i, message: `Extra action in A: ${a.action}` });
      continue;
    }

    if (a.action !== b.action) {
      diffs.push({
        type: "action-type",
        index: i,
        message: `Action type differs at [${i}]: ${a.action} vs ${b.action}`,
      });
    }

    if (a.selector !== b.selector) {
      diffs.push({
        type: "selector",
        index: i,
        message: `Selector differs at [${i}]: "${a.selector}" vs "${b.selector}"`,
      });
    }

    // Flag large duration differences (>50% relative)
    if (a.durationMs > 0 && b.durationMs > 0) {
      const ratio = Math.max(a.durationMs, b.durationMs) / Math.min(a.durationMs, b.durationMs);
      if (ratio > 1.5) {
        diffs.push({
          type: "duration-divergence",
          index: i,
          message: `Duration divergence at [${i}] (${a.action}): ${a.durationMs}ms vs ${b.durationMs}ms (${ratio.toFixed(1)}x)`,
        });
      }
    }
  }

  return diffs;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    usage();
    process.exit(0);
  }

  const specs = opts.specs ?? DEFAULT_SPECS;
  const browsers = opts.browsers ?? DEFAULT_BROWSERS;
  const outRoot = path.join(root, "output", "cross-browser");

  await mkdir(outRoot, { recursive: true });

  console.log(`Cross-browser matrix`);
  console.log(`  Specs:    ${specs.join(", ")}`);
  console.log(`  Browsers: ${browsers.join(", ")}`);
  console.log();

  // Build if needed
  if (!opts.skipCapture && opts.build) {
    console.log("Building project...");
    const code = await run("pnpm", ["-s", "build"]);
    if (code !== 0) {
      console.error("Build failed.");
      process.exit(code);
    }
    console.log();
  }

  // Capture phase
  const captureResults = [];

  if (!opts.skipCapture) {
    for (const slug of specs) {
      const specPath = await resolveSpecPath(slug);
      if (!specPath) {
        console.error(`  [SKIP] ${slug} — spec file not found`);
        continue;
      }

      for (const browser of browsers) {
        const outDir = path.join(outRoot, `${slug}-${browser}`);
        await mkdir(outDir, { recursive: true });

        console.log(`  [CAPTURE] ${slug} / ${browser}`);

        const captureEnv = { ...process.env, BROWSER: browser };
        const args = [
          "dist/cli.js",
          "capture",
          specPath,
          "--output",
          outDir,
          "--overwrite",
          "--no-narration",
        ];

        const code = await run("node", args, { cwd: root, env: captureEnv });
        captureResults.push({ slug, browser, exitCode: code, outDir });

        if (code !== 0) {
          console.error(`  [FAIL]  ${slug} / ${browser} (exit ${code})`);
        } else {
          console.log(`  [DONE]  ${slug} / ${browser}`);
        }
      }
    }
    console.log();
  }

  // Comparison phase
  console.log("Comparing event logs across browsers...\n");
  const comparisons = [];

  for (const slug of specs) {
    const browserEvents = {};

    for (const browser of browsers) {
      const eventsPath = path.join(outRoot, `${slug}-${browser}`, "events.json");
      if (await exists(eventsPath)) {
        try {
          browserEvents[browser] = JSON.parse(await readFile(eventsPath, "utf8"));
        } catch {
          console.error(`  [WARN] ${slug}/${browser}: failed to parse events.json`);
        }
      }
    }

    const availableBrowsers = Object.keys(browserEvents);
    if (availableBrowsers.length < 2) {
      console.log(
        `  ${slug}: only ${availableBrowsers.length} browser(s) available — skipping comparison`,
      );
      comparisons.push({
        slug,
        browsersAvailable: availableBrowsers,
        pairComparisons: [],
        status: "insufficient-data",
      });
      continue;
    }

    const pairComparisons = [];

    // Compare each pair of browsers
    for (let i = 0; i < availableBrowsers.length; i++) {
      for (let j = i + 1; j < availableBrowsers.length; j++) {
        const bA = availableBrowsers[i];
        const bB = availableBrowsers[j];
        const seqA = extractActionSequence(browserEvents[bA]);
        const seqB = extractActionSequence(browserEvents[bB]);
        const diffs = diffActionSequences(seqA, seqB);

        pairComparisons.push({
          browserA: bA,
          browserB: bB,
          actionCountA: seqA.length,
          actionCountB: seqB.length,
          structuralDiffs: diffs.filter(
            (d) =>
              d.type === "count-mismatch" || d.type === "action-type" || d.type === "extra-action",
          ).length,
          timingDiffs: diffs.filter((d) => d.type === "duration-divergence").length,
          diffs,
        });

        const structCount = diffs.filter((d) => d.type !== "duration-divergence").length;

        const icon = structCount === 0 ? "OK" : "DIFF";
        console.log(
          `  ${slug.padEnd(24)} ${bA} vs ${bB}: [${icon}] ${structCount} structural, ${diffs.filter((d) => d.type === "duration-divergence").length} timing`,
        );

        if (diffs.length > 0) {
          for (const d of diffs.slice(0, 5)) {
            console.log(`    - ${d.message}`);
          }
          if (diffs.length > 5) {
            console.log(`    ... and ${diffs.length - 5} more`);
          }
        }
      }
    }

    const hasStructuralDiffs = pairComparisons.some((p) => p.structuralDiffs > 0);

    comparisons.push({
      slug,
      browsersAvailable: availableBrowsers,
      pairComparisons,
      status: hasStructuralDiffs ? "divergent" : "consistent",
    });
  }

  // Write report
  const report = {
    generatedAt: new Date().toISOString(),
    specs,
    browsers,
    captureResults: opts.skipCapture
      ? "skipped"
      : captureResults.map((r) => ({
          slug: r.slug,
          browser: r.browser,
          exitCode: r.exitCode,
        })),
    comparisons,
    summary: {
      total: comparisons.length,
      consistent: comparisons.filter((c) => c.status === "consistent").length,
      divergent: comparisons.filter((c) => c.status === "divergent").length,
      insufficientData: comparisons.filter((c) => c.status === "insufficient-data").length,
    },
  };

  const reportPath = path.join(outRoot, "report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  // Console summary
  console.log("\n--- Summary ---");
  console.log(`  Consistent:        ${report.summary.consistent}`);
  console.log(`  Divergent:         ${report.summary.divergent}`);
  console.log(`  Insufficient data: ${report.summary.insufficientData}`);
  console.log(`\nReport: ${reportPath}`);

  // Exit with failure if any structural divergences
  process.exit(report.summary.divergent > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
