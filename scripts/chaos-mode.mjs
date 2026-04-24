#!/usr/bin/env node
/**
 * chaos-mode.mjs — Mutation testing for the demo capture pipeline.
 *
 * Takes a working YAML spec and applies deliberate mutations to verify that
 * the pipeline correctly detects failures. A "survived" mutant (capture
 * succeeds despite the mutation) means our error detection has a gap.
 *
 * Usage:
 *   node scripts/chaos-mode.mjs --spec examples/todo-app.demo.yaml
 *   node scripts/chaos-mode.mjs --all
 *   node scripts/chaos-mode.mjs --all --mutations bad-selector,bad-url
 *   node scripts/chaos-mode.mjs --spec examples/todo-app.demo.yaml --timeout 45000
 *   node scripts/chaos-mode.mjs --help
 *
 * Exit codes:
 *   0  — all mutants were killed (detected)
 *   N  — N mutants survived (undetected failures)
 *   2  — usage error
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const ALL_MUTATIONS = [
  "bad-selector",
  "wrong-action",
  "remove-wait",
  "bad-url",
  "bad-assert",
  "swap-order",
  "remove-step",
  "bad-timeout",
  "duplicate-action",
];

const DEFAULT_TIMEOUT_MS = 30_000;

/* ------------------------------------------------------------------ */
/*  CLI parsing                                                       */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const opts = {
    spec: null,
    all: false,
    mutations: null,
    timeout: DEFAULT_TIMEOUT_MS,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--spec") {
      opts.spec = argv[++i] ?? null;
    } else if (a === "--all") {
      opts.all = true;
    } else if (a === "--mutations") {
      opts.mutations = (argv[++i] ?? "").split(",").filter(Boolean);
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
      "chaos-mode — Mutation testing for the demo capture pipeline",
      "",
      "Usage:",
      "  node scripts/chaos-mode.mjs --spec <path>          Test one spec",
      "  node scripts/chaos-mode.mjs --all                  Test all PR-tier specs",
      "  node scripts/chaos-mode.mjs --all --mutations bad-selector,bad-url",
      "",
      "Options:",
      "  --spec <path>           Path to a single .demo.yaml spec",
      "  --all                   Run against all PR-tier specs from manifest.json",
      "  --mutations <list>      Comma-separated mutation types to apply",
      "  --timeout <ms>          Per-capture timeout (default 30000)",
      "  -h, --help              Show this help message",
      "",
      "Mutation types:",
      `  ${ALL_MUTATIONS.join(", ")}`,
      "",
      "Exit codes:",
      "  0   All mutants killed (pipeline detected every mutation)",
      "  N   N mutants survived (undetected — pipeline has gaps)",
      "  2   Usage error",
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

/** Collect all steps across all chapters into a flat list with metadata. */
function flattenSteps(spec) {
  const steps = [];
  for (let ci = 0; ci < (spec.chapters ?? []).length; ci++) {
    const chapter = spec.chapters[ci];
    for (let si = 0; si < (chapter.steps ?? []).length; si++) {
      steps.push({ chapterIndex: ci, stepIndex: si, step: chapter.steps[si] });
    }
  }
  return steps;
}

/** Pick a random element from an array, returning { item, index } or null. */
function pickRandom(arr) {
  if (arr.length === 0) return null;
  const index = Math.floor(Math.random() * arr.length);
  return { item: arr[index], index };
}

/** Deep-clone a plain object. */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Derive a slug from a spec path, e.g. "examples/todo-app.demo.yaml" -> "todo-app". */
function slugFromPath(specPath) {
  return path
    .basename(specPath)
    .replace(/\.demo\.ya?ml$/i, "")
    .replaceAll(" ", "-");
}

/* ------------------------------------------------------------------ */
/*  Mutation applicators                                              */
/* ------------------------------------------------------------------ */

/**
 * Each mutator returns { applied: boolean, description: string }.
 * The spec is mutated in-place (caller should pass a deep clone).
 */

const mutators = {
  "bad-selector"(spec) {
    const steps = flattenSteps(spec);
    const eligible = steps.filter((s) => s.step.selector);
    const pick = pickRandom(eligible);
    if (!pick) return { applied: false, description: "No step with selector found" };
    const original = pick.item.step.selector;
    spec.chapters[pick.item.chapterIndex].steps[pick.item.stepIndex].selector =
      "#does-not-exist-chaos";
    return {
      applied: true,
      description: `Changed selector "${original}" to "#does-not-exist-chaos" (chapter ${pick.item.chapterIndex}, step ${pick.item.stepIndex})`,
    };
  },

  "wrong-action"(spec) {
    const steps = flattenSteps(spec);
    const clickSteps = steps.filter((s) => s.step.action === "click");
    const pick = pickRandom(clickSteps);
    if (!pick) return { applied: false, description: "No click step found" };
    // Change click to type without providing text — should be caught by validation or runtime
    const step = spec.chapters[pick.item.chapterIndex].steps[pick.item.stepIndex];
    step.action = "type";
    // Deliberately omit text to make this invalid
    delete step.text;
    return {
      applied: true,
      description: `Changed click to type (no text) at chapter ${pick.item.chapterIndex}, step ${pick.item.stepIndex}`,
    };
  },

  "remove-wait"(spec) {
    const steps = flattenSteps(spec);
    const waitSteps = steps.filter((s) => s.step.action === "wait");
    const pick = pickRandom(waitSteps);
    if (!pick) return { applied: false, description: "No wait step found" };
    spec.chapters[pick.item.chapterIndex].steps.splice(pick.item.stepIndex, 1);
    return {
      applied: true,
      description: `Removed wait step at chapter ${pick.item.chapterIndex}, step ${pick.item.stepIndex}`,
    };
  },

  "bad-url"(spec) {
    const steps = flattenSteps(spec);
    const navSteps = steps.filter((s) => s.step.action === "navigate");
    const pick = pickRandom(navSteps);
    if (!pick) return { applied: false, description: "No navigate step found" };
    const original = pick.item.step.url;
    spec.chapters[pick.item.chapterIndex].steps[pick.item.stepIndex].url =
      "http://localhost:99999/chaos-404-page";
    return {
      applied: true,
      description: `Changed navigate URL "${original}" to a non-routable address (chapter ${pick.item.chapterIndex}, step ${pick.item.stepIndex})`,
    };
  },

  "bad-assert"(spec) {
    const steps = flattenSteps(spec);
    const assertSteps = steps.filter((s) => s.step.action === "assert" && s.step.text != null);
    if (assertSteps.length > 0) {
      const pick = pickRandom(assertSteps);
      const original = pick.item.step.text;
      spec.chapters[pick.item.chapterIndex].steps[pick.item.stepIndex].text =
        "CHAOS_NONEXISTENT_TEXT_12345";
      return {
        applied: true,
        description: `Changed assert text "${original}" to impossible match (chapter ${pick.item.chapterIndex}, step ${pick.item.stepIndex})`,
      };
    }
    // If no text asserts, add one with impossible text on a clickable element
    const clickable = steps.filter((s) => s.step.selector && s.step.action !== "navigate");
    const pick = pickRandom(clickable);
    if (!pick) return { applied: false, description: "No suitable step for assert injection" };
    const assertStep = {
      action: "assert",
      selector: pick.item.step.selector,
      text: "CHAOS_NONEXISTENT_TEXT_12345",
    };
    spec.chapters[pick.item.chapterIndex].steps.splice(pick.item.stepIndex, 0, assertStep);
    return {
      applied: true,
      description: `Injected impossible assert before chapter ${pick.item.chapterIndex}, step ${pick.item.stepIndex}`,
    };
  },

  "swap-order"(spec) {
    // Find a chapter with at least 2 non-navigate steps to swap
    for (let ci = 0; ci < spec.chapters.length; ci++) {
      const chapter = spec.chapters[ci];
      if (chapter.steps.length >= 3) {
        // Swap steps at index 1 and 2 (skip navigate at index 0)
        const swapIdx = Math.min(1, chapter.steps.length - 2);
        const temp = chapter.steps[swapIdx];
        chapter.steps[swapIdx] = chapter.steps[swapIdx + 1];
        chapter.steps[swapIdx + 1] = temp;
        return {
          applied: true,
          description: `Swapped steps ${swapIdx} and ${swapIdx + 1} in chapter ${ci}`,
        };
      }
    }
    return { applied: false, description: "No chapter with enough steps to swap" };
  },

  "remove-step"(spec) {
    const steps = flattenSteps(spec);
    const navSteps = steps.filter((s) => s.step.action === "navigate");
    if (navSteps.length > 0) {
      // Remove the first navigate — this should break everything
      const pick = navSteps[0];
      spec.chapters[pick.chapterIndex].steps.splice(pick.stepIndex, 1);
      // If chapter is now empty, remove it
      if (spec.chapters[pick.chapterIndex].steps.length === 0) {
        spec.chapters.splice(pick.chapterIndex, 1);
      }
      return {
        applied: true,
        description: `Removed navigate step from chapter ${pick.chapterIndex}`,
      };
    }
    // Fall back to removing first step of first chapter
    if (spec.chapters.length > 0 && spec.chapters[0].steps.length > 0) {
      const removed = spec.chapters[0].steps.shift();
      return {
        applied: true,
        description: `Removed first step (${removed.action}) from chapter 0`,
      };
    }
    return { applied: false, description: "No steps to remove" };
  },

  "bad-timeout"(spec) {
    const steps = flattenSteps(spec);
    const waitSteps = steps.filter((s) => s.step.action === "wait");
    if (waitSteps.length > 0) {
      const pick = pickRandom(waitSteps);
      spec.chapters[pick.item.chapterIndex].steps[pick.item.stepIndex].timeout = 10;
      return {
        applied: true,
        description: `Set impossibly short timeout (10ms) on wait at chapter ${pick.item.chapterIndex}, step ${pick.item.stepIndex}`,
      };
    }
    // Add a wait with impossibly short timeout before a click
    const clickable = steps.filter((s) => s.step.action === "click");
    const pick = pickRandom(clickable);
    if (!pick) return { applied: false, description: "No suitable step for timeout mutation" };
    spec.chapters[pick.item.chapterIndex].steps.splice(pick.item.stepIndex, 0, {
      action: "wait",
      timeout: 10,
    });
    return {
      applied: true,
      description: `Injected wait with 10ms timeout before chapter ${pick.item.chapterIndex}, step ${pick.item.stepIndex}`,
    };
  },

  "duplicate-action"(spec) {
    const steps = flattenSteps(spec);
    const clickSteps = steps.filter((s) => s.step.action === "click" && s.step.selector);
    const pick = pickRandom(clickSteps);
    if (!pick) return { applied: false, description: "No click step with selector found" };
    // Add conflicting type action to the same step (click + type on same object)
    const step = spec.chapters[pick.item.chapterIndex].steps[pick.item.stepIndex];
    // Insert a type step right after with the same selector but action will conflict
    const conflicting = {
      action: "type",
      selector: step.selector,
      text: "chaos-duplicate-text",
    };
    // Also change the original to have both click and type characteristics
    // by inserting a type right after with same selector
    spec.chapters[pick.item.chapterIndex].steps.splice(pick.item.stepIndex + 1, 0, conflicting);
    // Also add a click right before the type to create navigate->interact conflict pattern
    return {
      applied: true,
      description: `Added duplicate type action after click at chapter ${pick.item.chapterIndex}, step ${pick.item.stepIndex}`,
    };
  },
};

/* ------------------------------------------------------------------ */
/*  Runner                                                            */
/* ------------------------------------------------------------------ */

/**
 * Run a capture with the given spec, returning { exitCode, timedOut, durationMs }.
 */
function runCapture(specPath, outputDir, timeoutMs) {
  return new Promise((resolve) => {
    const args = [
      "dist/cli.js",
      "capture",
      specPath,
      "--output",
      outputDir,
      "--overwrite",
      "--no-narration",
    ];
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
      // Give the process a moment to die, then force kill
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

/**
 * Check whether a capture run detected the mutation (i.e., failed).
 */
async function checkDetection(outputDir, exitCode, timedOut) {
  // Non-zero exit code means the pipeline reported a failure — mutation detected
  if (exitCode !== 0) {
    return { detected: true, reason: timedOut ? "timeout" : `exit code ${exitCode}` };
  }

  // Check for failure.json in the output directory
  try {
    await readFile(path.join(outputDir, "failure.json"), "utf8");
    return { detected: true, reason: "failure.json present" };
  } catch {
    /* no failure.json */
  }

  // Check verification.json for non-passed status
  try {
    const verification = JSON.parse(
      await readFile(path.join(outputDir, "verification.json"), "utf8"),
    );
    if (verification?.status !== "passed") {
      return { detected: true, reason: `verification status: ${verification?.status}` };
    }
  } catch {
    /* no verification.json — if the capture produced nothing, it probably failed */
    return { detected: true, reason: "no verification.json (likely crashed)" };
  }

  // If we get here, the capture succeeded despite the mutation — mutant survived
  return { detected: false, reason: "capture succeeded (mutant survived)" };
}

/* ------------------------------------------------------------------ */
/*  Spec collection                                                   */
/* ------------------------------------------------------------------ */

async function getPrTierSpecs() {
  const manifestPath = path.join(root, "examples", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const specs = [];
  for (const suite of manifest.suites ?? []) {
    if (suite.releaseTier === "pr") {
      specs.push(path.join(root, suite.canonicalSpec));
    }
  }
  return specs;
}

/* ------------------------------------------------------------------ */
/*  Summary formatting                                                */
/* ------------------------------------------------------------------ */

function printSummary(results) {
  const killed = results.filter((r) => r.detected);
  const survived = results.filter((r) => !r.detected);

  console.log("\n" + "=".repeat(72));
  console.log("CHAOS MODE — Mutation Testing Report");
  console.log("=".repeat(72));
  console.log(`Total mutations: ${results.length}`);
  console.log(`  Killed (detected):   ${killed.length}`);
  console.log(`  Survived (missed):   ${survived.length}`);
  console.log(`  Skipped:             ${results.filter((r) => r.skipped).length}`);
  console.log(
    `  Score:               ${results.length > 0 ? ((killed.length / results.length) * 100).toFixed(1) : 0}%`,
  );
  console.log("-".repeat(72));

  // Table header
  const col = (s, w) => String(s).padEnd(w);
  console.log(
    `${col("Spec", 22)} ${col("Mutation", 20)} ${col("Result", 10)} ${col("Reason", 30)} ${col("Time", 8)}`,
  );
  console.log("-".repeat(92));

  for (const r of results) {
    const status = r.skipped ? "SKIP" : r.detected ? "KILLED" : "SURVIVED";
    const duration = r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : "-";
    console.log(
      `${col(r.slug, 22)} ${col(r.mutation, 20)} ${col(status, 10)} ${col(r.reason, 30)} ${col(duration, 8)}`,
    );
  }

  console.log("-".repeat(92));

  if (survived.length > 0) {
    console.log("\nSURVIVED MUTANTS (pipeline failed to detect these errors):");
    for (const r of survived) {
      console.log(`  - ${r.slug} / ${r.mutation}: ${r.description}`);
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

  if (!opts.spec && !opts.all) {
    console.error("Error: provide --spec <path> or --all.");
    console.error('Run with --help for usage information."');
    process.exit(2);
  }

  if (opts.spec && opts.all) {
    console.error("Error: provide --spec or --all, not both.");
    process.exit(2);
  }

  const mutations = opts.mutations ?? ALL_MUTATIONS;
  for (const m of mutations) {
    if (!ALL_MUTATIONS.includes(m)) {
      console.error(`Error: unknown mutation type "${m}".`);
      console.error(`Valid types: ${ALL_MUTATIONS.join(", ")}`);
      process.exit(2);
    }
  }

  // Collect specs
  let specPaths;
  if (opts.spec) {
    specPaths = [path.resolve(opts.spec)];
  } else {
    specPaths = await getPrTierSpecs();
    if (specPaths.length === 0) {
      console.error("No PR-tier specs found in manifest.json.");
      process.exit(2);
    }
  }

  const chaosRoot = path.join(root, "output", "chaos");
  await mkdir(chaosRoot, { recursive: true });

  const results = [];

  for (const specPath of specPaths) {
    const slug = slugFromPath(specPath);
    console.log(`\nSpec: ${slug} (${specPath})`);

    let rawYaml;
    try {
      rawYaml = await readFile(specPath, "utf8");
    } catch (err) {
      console.error(`  Failed to read spec: ${err.message}`);
      continue;
    }

    let originalSpec;
    try {
      originalSpec = parseYaml(rawYaml);
    } catch (err) {
      console.error(`  Failed to parse spec: ${err.message}`);
      continue;
    }

    for (const mutationType of mutations) {
      const mutator = mutators[mutationType];
      if (!mutator) continue;

      const mutated = clone(originalSpec);
      const { applied, description } = mutator(mutated);

      if (!applied) {
        console.log(`  [SKIP] ${mutationType}: ${description}`);
        results.push({
          slug,
          mutation: mutationType,
          detected: false,
          skipped: true,
          reason: description,
          description,
        });
        continue;
      }

      // Write mutated spec
      const mutatedSlug = `${slug}-${mutationType}`;
      const mutatedSpecPath = path.join(chaosRoot, `${mutatedSlug}.yaml`);
      const mutatedOutputDir = path.join(chaosRoot, mutatedSlug);

      await mkdir(mutatedOutputDir, { recursive: true });
      await writeFile(mutatedSpecPath, stringifyYaml(mutated), "utf8");

      console.log(`  [RUN]  ${mutationType}: ${description}`);

      const { exitCode, timedOut, durationMs } = await runCapture(
        mutatedSpecPath,
        mutatedOutputDir,
        opts.timeout,
      );
      const detection = await checkDetection(mutatedOutputDir, exitCode, timedOut);

      const symbol = detection.detected ? "KILLED" : "SURVIVED";
      console.log(
        `         -> ${symbol} (${detection.reason}, ${(durationMs / 1000).toFixed(1)}s)`,
      );

      results.push({
        slug,
        mutation: mutationType,
        detected: detection.detected,
        skipped: false,
        reason: detection.reason,
        description,
        exitCode,
        timedOut,
        durationMs,
        mutatedSpecPath,
        mutatedOutputDir,
      });
    }
  }

  // Write report
  const reportPath = path.join(chaosRoot, "report.json");
  const killed = results.filter((r) => r.detected && !r.skipped);
  const survived = results.filter((r) => !r.detected && !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  const total = results.filter((r) => !r.skipped).length;

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total,
      killed: killed.length,
      survived: survived.length,
      skipped: skipped.length,
      score: total > 0 ? Number(((killed.length / total) * 100).toFixed(1)) : 0,
    },
    results,
  };

  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`\nReport written to: ${reportPath}`);

  printSummary(results);

  // Exit code = number of survived mutants
  process.exit(survived.length);
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(2);
});
