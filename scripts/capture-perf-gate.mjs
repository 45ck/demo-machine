#!/usr/bin/env node
/**
 * capture-perf-gate.mjs — Performance gate for capture durations.
 *
 * Compares current capture timing against a baseline. Fails if any phase
 * exceeds the baseline by more than 25%.
 *
 * Usage:
 *   node scripts/capture-perf-gate.mjs --baseline <path> --current <path>
 *   node scripts/capture-perf-gate.mjs --help
 *
 * Baseline format (baselines/perf/{slug}.json):
 *   { "captureMs": 12000, "renderMs": 8000, "totalMs": 20000 }
 *
 * Current format (same shape, produced by the capture pipeline):
 *   { "captureMs": 13500, "renderMs": 7500, "totalMs": 21000 }
 *
 * Exit codes:
 *   0 — pass (all phases within tolerance)
 *   1 — regression detected (at least one phase exceeds baseline by >25%)
 *   2 — usage error
 */
import { readFile } from "node:fs/promises";
import process from "node:process";

const THRESHOLD = 1.25; // 25% tolerance

const PHASES = ["captureMs", "renderMs", "totalMs"];

function parseArgs(argv) {
  const opts = { baseline: null, current: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--baseline") {
      opts.baseline = argv[++i] ?? null;
    } else if (a === "--current") {
      opts.current = argv[++i] ?? null;
    } else if (a === "-h" || a === "--help") {
      opts.help = true;
    }
  }
  return opts;
}

function usage() {
  console.log(
    [
      "capture-perf-gate — Performance gate for capture durations",
      "",
      "Usage:",
      "  node scripts/capture-perf-gate.mjs --baseline <path> --current <path>",
      "",
      "Options:",
      "  --baseline <path>  Path to the baseline perf JSON",
      "  --current  <path>  Path to the current perf JSON",
      "  -h, --help         Show this help message",
      "",
      "Fails (exit 1) if any phase exceeds baseline by >25%.",
    ].join("\n"),
  );
}

function evaluatePhase(phase, baselineValue, currentValue) {
  const limit = baselineValue * THRESHOLD;
  const ratio = baselineValue > 0 ? currentValue / baselineValue : 0;
  const regression = currentValue > limit;
  return {
    phase,
    baselineMs: baselineValue,
    currentMs: currentValue,
    limitMs: Math.round(limit),
    ratio: Math.round(ratio * 100) / 100,
    regression,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    usage();
    process.exit(0);
  }

  if (!opts.baseline || !opts.current) {
    console.error("Error: --baseline and --current are required.");
    console.error("Run with --help for usage information.");
    process.exit(2);
  }

  let baseline;
  let current;

  try {
    baseline = JSON.parse(await readFile(opts.baseline, "utf8"));
  } catch (err) {
    console.error(`Error reading baseline file: ${err.message}`);
    process.exit(2);
  }

  try {
    current = JSON.parse(await readFile(opts.current, "utf8"));
  } catch (err) {
    console.error(`Error reading current file: ${err.message}`);
    process.exit(2);
  }

  const phases = [];
  let hasRegression = false;

  for (const phase of PHASES) {
    const baselineValue = typeof baseline[phase] === "number" ? baseline[phase] : 0;
    const currentValue = typeof current[phase] === "number" ? current[phase] : 0;

    // Skip phases that have no baseline (0 or missing)
    if (baselineValue <= 0) {
      phases.push({
        phase,
        baselineMs: baselineValue,
        currentMs: currentValue,
        limitMs: 0,
        ratio: 0,
        regression: false,
        skipped: true,
      });
      continue;
    }

    const result = evaluatePhase(phase, baselineValue, currentValue);
    phases.push(result);
    if (result.regression) hasRegression = true;
  }

  const status = hasRegression ? "regression" : "pass";
  const output = { status, threshold: `${Math.round((THRESHOLD - 1) * 100)}%`, phases };

  console.log(JSON.stringify(output, null, 2));

  process.exit(status === "pass" ? 0 : 1);
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(2);
});
