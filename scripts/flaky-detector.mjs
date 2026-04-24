#!/usr/bin/env node
/**
 * flaky-detector.mjs — Run demos N times and diff for flakiness.
 *
 * Captures a spec multiple times, then compares events.json structurally
 * across runs. Flags structural differences (action order) and high
 * timing variance as flaky behavior.
 *
 * Usage:
 *   node scripts/flaky-detector.mjs --spec examples/todo-app.demo.yaml --runs 3
 *   node scripts/flaky-detector.mjs --tier pr --runs 5
 *   node scripts/flaky-detector.mjs --help
 *
 * Exit codes:
 *   0  — no flakiness detected
 *   1  — flakiness detected in one or more specs
 *   2  — usage error
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const DEFAULT_RUNS = 3;
const DEFAULT_TIMEOUT_MS = 60_000;
const TIMING_VARIANCE_THRESHOLD = 0.5; // 50%

/* ------------------------------------------------------------------ */
/*  CLI parsing                                                       */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const opts = {
    spec: null,
    tier: null,
    runs: DEFAULT_RUNS,
    timeout: DEFAULT_TIMEOUT_MS,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--spec") {
      opts.spec = argv[++i] ?? null;
    } else if (a === "--tier") {
      opts.tier = argv[++i] ?? null;
    } else if (a === "--runs") {
      const raw = argv[++i];
      opts.runs = raw ? Number(raw) : DEFAULT_RUNS;
    } else if (a === "--timeout") {
      const raw = argv[++i];
      opts.timeout = raw ? Number(raw) : DEFAULT_TIMEOUT_MS;
    } else if (a === "-h" || a === "--help") {
      opts.help = true;
    }
  }
  return opts;
}

function usage() {
  console.log(
    [
      "flaky-detector — Run demos N times and diff for flakiness",
      "",
      "Usage:",
      "  node scripts/flaky-detector.mjs --spec <path> [--runs N]",
      "  node scripts/flaky-detector.mjs --tier pr [--runs N]",
      "",
      "Options:",
      "  --spec <path>    Path to a single .demo.yaml spec",
      "  --tier <pr|nightly>  Run all specs in the given release tier",
      "  --runs <N>       Number of capture runs per spec (default 3)",
      "  --timeout <ms>   Per-capture timeout (default 60000)",
      "  -h, --help       Show this help message",
      "",
      "Exit codes:",
      "  0  No flakiness detected",
      "  1  Flakiness detected",
      "  2  Usage error",
    ].join("\n"),
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

function resolveCommand(cmd) {
  if (process.platform !== "win32") return cmd;
  if (cmd === "node") return "node.exe";
  return cmd;
}

function slugFromPath(specPath) {
  return path
    .basename(specPath)
    .replace(/\.demo\.ya?ml$/i, "")
    .replaceAll(" ", "-");
}

/* ------------------------------------------------------------------ */
/*  Spec collection                                                   */
/* ------------------------------------------------------------------ */

async function getSpecsByTier(tier) {
  const manifestPath = path.join(root, "examples", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const specs = [];
  for (const suite of manifest.suites ?? []) {
    // "pr" tier: only pr; "nightly" tier: all
    if (tier === "pr" && suite.releaseTier !== "pr") continue;
    specs.push(path.join(root, suite.canonicalSpec));
  }
  return specs;
}

/* ------------------------------------------------------------------ */
/*  Runner                                                            */
/* ------------------------------------------------------------------ */

function runCapture(specPath, outputDir, timeoutMs) {
  return new Promise((resolve) => {
    const args = ["dist/cli.js", "capture", specPath, "--output", outputDir, "--no-narration"];
    const startMs = Date.now();
    let timedOut = false;
    let settled = false;

    const child = spawn(resolveCommand("node"), args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 3000);
    }, timeoutMs);

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: code ?? 1,
        timedOut,
        durationMs: Date.now() - startMs,
        stdout,
        stderr,
      });
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        timedOut: false,
        durationMs: Date.now() - startMs,
        stdout,
        stderr: stderr + "\n" + String(err),
      });
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Structural comparison (mirrors events-diff.mjs logic)             */
/* ------------------------------------------------------------------ */

/** Extract the structural fingerprint: action type + selector. */
function extractSequence(events) {
  return events.map((e) => ({
    action: e.action ?? null,
    selector: e.selector ?? null,
  }));
}

/** Extract timing data: action type + timestamp for variance analysis. */
function extractTimings(events) {
  return events.map((e) => ({
    action: e.action ?? null,
    selector: e.selector ?? null,
    timestamp: e.timestamp ?? e.startTime ?? e.ts ?? null,
    duration: e.duration ?? e.durationMs ?? null,
  }));
}

/**
 * Compare two sequences structurally.
 * Returns { match: boolean, additions, removals, reorders }.
 */
function diffSequences(seqA, seqB) {
  const toKey = (entry) => JSON.stringify([entry.action, entry.selector]);
  const keysA = seqA.map(toKey);
  const keysB = seqB.map(toKey);

  const additions = [];
  const removals = [];
  const reorders = [];

  const countsA = new Map();
  for (const key of keysA) countsA.set(key, (countsA.get(key) ?? 0) + 1);
  const countsB = new Map();
  for (const key of keysB) countsB.set(key, (countsB.get(key) ?? 0) + 1);

  for (const [key, count] of countsB) {
    const baseCount = countsA.get(key) ?? 0;
    if (count > baseCount) {
      const parsed = JSON.parse(key);
      for (let n = 0; n < count - baseCount; n++) {
        additions.push({ action: parsed[0], selector: parsed[1] });
      }
    }
  }

  for (const [key, count] of countsA) {
    const curCount = countsB.get(key) ?? 0;
    if (count > curCount) {
      const parsed = JSON.parse(key);
      for (let n = 0; n < count - curCount; n++) {
        removals.push({ action: parsed[0], selector: parsed[1] });
      }
    }
  }

  if (additions.length === 0 && removals.length === 0 && keysA.length === keysB.length) {
    for (let i = 0; i < keysA.length; i++) {
      if (keysA[i] !== keysB[i]) {
        reorders.push({ index: i, baseline: seqA[i], current: seqB[i] });
      }
    }
  }

  const match = additions.length === 0 && removals.length === 0 && reorders.length === 0;
  return { match, additions, removals, reorders };
}

/* ------------------------------------------------------------------ */
/*  Timing variance analysis                                          */
/* ------------------------------------------------------------------ */

function computeTimingVariance(allTimings) {
  // allTimings is an array of per-run timing arrays
  // Align by index (same action sequence position across runs)
  if (allTimings.length < 2) return [];

  const refLength = allTimings[0].length;
  const results = [];

  for (let i = 0; i < refLength; i++) {
    const durations = allTimings
      .map((runTimings) => (i < runTimings.length ? runTimings[i].duration : null))
      .filter((d) => d != null && Number.isFinite(d));

    if (durations.length < 2) continue;

    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    if (mean === 0) continue;

    const variance = durations.reduce((sum, d) => sum + (d - mean) ** 2, 0) / durations.length;
    const stddev = Math.sqrt(variance);
    const coefficient = stddev / mean; // coefficient of variation

    const entry = {
      index: i,
      action: allTimings[0][i].action,
      selector: allTimings[0][i].selector,
      mean: Math.round(mean),
      stddev: Math.round(stddev),
      coefficient: Number(coefficient.toFixed(3)),
      durations,
      flaky: coefficient > TIMING_VARIANCE_THRESHOLD,
    };

    results.push(entry);
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Summary formatting                                                */
/* ------------------------------------------------------------------ */

function printSummary(specResults) {
  console.log("\n" + "=".repeat(72));
  console.log("FLAKY DETECTOR — Stability Report");
  console.log("=".repeat(72));

  const totalSpecs = specResults.length;
  const flakySpecs = specResults.filter((s) => s.flaky);

  console.log(`Total specs tested:  ${totalSpecs}`);
  console.log(`Flaky specs:         ${flakySpecs.length}`);
  console.log(`Stable specs:        ${totalSpecs - flakySpecs.length}`);
  console.log("-".repeat(72));

  const col = (s, w) => String(s).padEnd(w);
  console.log(
    `${col("Spec", 25)} ${col("Runs", 6)} ${col("Success", 9)} ${col("Structural", 12)} ${col("Timing", 12)} ${col("Score", 8)}`,
  );
  console.log("-".repeat(72));

  for (const sr of specResults) {
    const structuralStatus = sr.structuralDiffs > 0 ? `${sr.structuralDiffs} diffs` : "stable";
    const timingStatus = sr.timingFlakyActions > 0 ? `${sr.timingFlakyActions} actions` : "stable";
    console.log(
      `${col(sr.slug, 25)} ${col(sr.totalRuns, 6)} ${col(sr.successRuns, 9)} ${col(structuralStatus, 12)} ${col(timingStatus, 12)} ${col(sr.score.toFixed(1) + "%", 8)}`,
    );
  }

  console.log("-".repeat(72));

  // Detail flaky specs
  for (const sr of flakySpecs) {
    console.log(`\nFLAKY: ${sr.slug}`);
    if (sr.failedRuns > 0) {
      console.log(`  - ${sr.failedRuns}/${sr.totalRuns} runs failed outright`);
    }
    if (sr.structuralDiffs > 0) {
      console.log(`  - ${sr.structuralDiffs} structural differences across runs`);
      for (const diff of sr.structuralDetails) {
        if (diff.additions.length > 0) {
          console.log(`    Added actions in run ${diff.runB}: ${JSON.stringify(diff.additions)}`);
        }
        if (diff.removals.length > 0) {
          console.log(`    Removed actions in run ${diff.runB}: ${JSON.stringify(diff.removals)}`);
        }
        if (diff.reorders.length > 0) {
          console.log(`    Reordered actions in run ${diff.runB}: ${diff.reorders.length} steps`);
        }
      }
    }
    if (sr.timingFlakyActions > 0) {
      console.log(`  - ${sr.timingFlakyActions} actions with >50% timing variance:`);
      for (const ta of sr.timingDetails.filter((t) => t.flaky)) {
        console.log(
          `    [${ta.index}] ${ta.action} ${ta.selector ?? ""} — mean ${ta.mean}ms, stddev ${ta.stddev}ms (CV ${(ta.coefficient * 100).toFixed(0)}%)`,
        );
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    usage();
    process.exit(0);
  }

  if (!opts.spec && !opts.tier) {
    console.error("Error: provide --spec <path> or --tier <pr|nightly>.");
    console.error('Run with --help for usage information."');
    process.exit(2);
  }

  if (opts.spec && opts.tier) {
    console.error("Error: provide --spec or --tier, not both.");
    process.exit(2);
  }

  if (!Number.isFinite(opts.runs) || opts.runs < 2) {
    console.error("Error: --runs must be at least 2.");
    process.exit(2);
  }

  if (opts.tier && !["pr", "nightly"].includes(opts.tier)) {
    console.error(`Error: --tier must be "pr" or "nightly".`);
    process.exit(2);
  }

  // Collect specs
  let specPaths;
  if (opts.spec) {
    specPaths = [path.resolve(opts.spec)];
  } else {
    specPaths = await getSpecsByTier(opts.tier);
    if (specPaths.length === 0) {
      console.error(`No specs found for tier "${opts.tier}".`);
      process.exit(2);
    }
  }

  const flakyRoot = path.join(root, "output", "flaky");
  await mkdir(flakyRoot, { recursive: true });

  const specResults = [];
  let anyFlaky = false;

  for (const specPath of specPaths) {
    const slug = slugFromPath(specPath);
    const specOutDir = path.join(flakyRoot, slug);
    await mkdir(specOutDir, { recursive: true });

    console.log(`\nSpec: ${slug} (${specPath})`);
    console.log(`  Running ${opts.runs} captures...`);

    const runResults = [];
    const successEvents = [];
    const allTimings = [];

    for (let run = 1; run <= opts.runs; run++) {
      const runDir = path.join(specOutDir, `run-${run}`);
      await mkdir(runDir, { recursive: true });

      console.log(`  [${run}/${opts.runs}] Capturing...`);
      const result = await runCapture(specPath, runDir, opts.timeout);

      const success = result.exitCode === 0 && !result.timedOut;
      console.log(
        `  [${run}/${opts.runs}] ${success ? "OK" : "FAIL"} (${(result.durationMs / 1000).toFixed(1)}s, exit ${result.exitCode}${result.timedOut ? " TIMEOUT" : ""})`,
      );

      runResults.push({
        run,
        success,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
      });

      if (success) {
        // Try to read events.json
        const eventsPath = path.join(runDir, "events.json");
        try {
          const events = JSON.parse(await readFile(eventsPath, "utf8"));
          if (Array.isArray(events)) {
            successEvents.push({ run, events });
            allTimings.push(extractTimings(events));

            // Also copy events.json for easier access
            await writeFile(
              path.join(specOutDir, `events-run-${run}.json`),
              JSON.stringify(events, null, 2) + "\n",
              "utf8",
            );
          }
        } catch {
          console.log(`  [${run}/${opts.runs}] Warning: could not read events.json`);
        }
      }
    }

    // Analyze structural differences
    const structuralDetails = [];
    let structuralDiffs = 0;

    if (successEvents.length >= 2) {
      const baselineSeq = extractSequence(successEvents[0].events);
      for (let i = 1; i < successEvents.length; i++) {
        const currentSeq = extractSequence(successEvents[i].events);
        const diff = diffSequences(baselineSeq, currentSeq);
        if (!diff.match) {
          structuralDiffs++;
          structuralDetails.push({
            runA: successEvents[0].run,
            runB: successEvents[i].run,
            additions: diff.additions,
            removals: diff.removals,
            reorders: diff.reorders,
          });
        }
      }
    }

    // Analyze timing variance
    const timingDetails = computeTimingVariance(allTimings);
    const timingFlakyActions = timingDetails.filter((t) => t.flaky).length;

    // Compute flakiness score (0 = perfectly stable, 100 = completely flaky)
    const totalRuns = runResults.length;
    const successRuns = runResults.filter((r) => r.success).length;
    const failedRuns = totalRuns - successRuns;

    let score = 100; // start at 100% stable
    // Penalize for failed runs
    if (failedRuns > 0) {
      score -= (failedRuns / totalRuns) * 50;
    }
    // Penalize for structural diffs
    if (structuralDiffs > 0) {
      score -= Math.min(30, structuralDiffs * 15);
    }
    // Penalize for timing variance
    if (timingFlakyActions > 0) {
      const totalActions = timingDetails.length || 1;
      score -= Math.min(20, (timingFlakyActions / totalActions) * 20);
    }
    score = Math.max(0, score);

    const specFlaky = failedRuns > 0 || structuralDiffs > 0;
    if (specFlaky) anyFlaky = true;

    const specResult = {
      slug,
      specPath,
      totalRuns,
      successRuns,
      failedRuns,
      structuralDiffs,
      structuralDetails,
      timingFlakyActions,
      timingDetails,
      flaky: specFlaky,
      score,
      runs: runResults,
    };

    specResults.push(specResult);
  }

  // Write report
  const reportPath = path.join(flakyRoot, "report.json");
  const report = {
    timestamp: new Date().toISOString(),
    runsPerSpec: opts.runs,
    summary: {
      totalSpecs: specResults.length,
      flakySpecs: specResults.filter((s) => s.flaky).length,
      stableSpecs: specResults.filter((s) => !s.flaky).length,
    },
    specs: specResults,
  };

  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`\nReport written to: ${reportPath}`);

  printSummary(specResults);

  process.exit(anyFlaky ? 1 : 0);
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(2);
});
