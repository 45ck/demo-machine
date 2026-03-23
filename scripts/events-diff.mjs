#!/usr/bin/env node
/**
 * events-diff.mjs — Structural diff for events.json files.
 *
 * Compares a baseline events.json against a current capture's events.json.
 * Reports structural differences (added/removed/reordered actions) while
 * ignoring timestamps and other volatile fields.
 *
 * Usage:
 *   node scripts/events-diff.mjs --baseline <path> --current <path>
 *   node scripts/events-diff.mjs --help
 *
 * Exit codes:
 *   0 — pass (no structural differences)
 *   1 — changes detected
 *   2 — usage error
 */
import { readFile } from "node:fs/promises";
import process from "node:process";

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
      "events-diff — Structural diff for events.json files",
      "",
      "Usage:",
      "  node scripts/events-diff.mjs --baseline <path> --current <path>",
      "",
      "Options:",
      "  --baseline <path>  Path to the baseline events.json",
      "  --current  <path>  Path to the current events.json",
      "  -h, --help         Show this help message",
      "",
      "Exit codes:",
      "  0  No structural differences (pass)",
      "  1  Structural changes detected",
      "  2  Usage error",
    ].join("\n"),
  );
}

/**
 * Extract the structural fingerprint from an events array.
 * Only action type and selector matter for structural comparison.
 */
function extractSequence(events) {
  return events.map((e) => ({
    action: e.action ?? null,
    selector: e.selector ?? null,
  }));
}

/**
 * Compare two action sequences and produce a diff report.
 */
function diffSequences(baselineSeq, currentSeq) {
  const additions = [];
  const removals = [];
  const reorders = [];

  // Build string keys for set-based comparison
  const toKey = (entry) => JSON.stringify([entry.action, entry.selector]);

  const baselineKeys = baselineSeq.map(toKey);
  const currentKeys = currentSeq.map(toKey);

  // Detect additions and removals using counted-set comparison
  const baselineCounts = new Map();
  for (const key of baselineKeys) {
    baselineCounts.set(key, (baselineCounts.get(key) ?? 0) + 1);
  }
  const currentCounts = new Map();
  for (const key of currentKeys) {
    currentCounts.set(key, (currentCounts.get(key) ?? 0) + 1);
  }

  // Items in current but not (or more than) in baseline → additions
  for (const [key, count] of currentCounts) {
    const baseCount = baselineCounts.get(key) ?? 0;
    if (count > baseCount) {
      const parsed = JSON.parse(key);
      for (let n = 0; n < count - baseCount; n++) {
        additions.push({ action: parsed[0], selector: parsed[1] });
      }
    }
  }

  // Items in baseline but not (or fewer) in current → removals
  for (const [key, count] of baselineCounts) {
    const curCount = currentCounts.get(key) ?? 0;
    if (count > curCount) {
      const parsed = JSON.parse(key);
      for (let n = 0; n < count - curCount; n++) {
        removals.push({ action: parsed[0], selector: parsed[1] });
      }
    }
  }

  // Detect reorders: same counted set but different order
  if (
    additions.length === 0 &&
    removals.length === 0 &&
    baselineKeys.length === currentKeys.length
  ) {
    for (let i = 0; i < baselineKeys.length; i++) {
      if (baselineKeys[i] !== currentKeys[i]) {
        reorders.push({
          index: i,
          baseline: baselineSeq[i],
          current: currentSeq[i],
        });
      }
    }
  }

  const status =
    additions.length === 0 && removals.length === 0 && reorders.length === 0 ? "pass" : "changed";

  return { status, additions, removals, reorders };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    usage();
    process.exit(0);
  }

  if (!opts.baseline || !opts.current) {
    console.error("Error: --baseline and --current are required.");
    console.error('Run with --help for usage information."');
    process.exit(2);
  }

  let baselineEvents;
  let currentEvents;

  try {
    baselineEvents = JSON.parse(await readFile(opts.baseline, "utf8"));
  } catch (err) {
    console.error(`Error reading baseline file: ${err.message}`);
    process.exit(2);
  }

  try {
    currentEvents = JSON.parse(await readFile(opts.current, "utf8"));
  } catch (err) {
    console.error(`Error reading current file: ${err.message}`);
    process.exit(2);
  }

  if (!Array.isArray(baselineEvents)) {
    console.error("Error: baseline file does not contain a JSON array.");
    process.exit(2);
  }
  if (!Array.isArray(currentEvents)) {
    console.error("Error: current file does not contain a JSON array.");
    process.exit(2);
  }

  const baselineSeq = extractSequence(baselineEvents);
  const currentSeq = extractSequence(currentEvents);
  const result = diffSequences(baselineSeq, currentSeq);

  console.log(JSON.stringify(result, null, 2));

  process.exit(result.status === "pass" ? 0 : 1);
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(2);
});
