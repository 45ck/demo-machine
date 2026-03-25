#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROOF_DIR = path.join(ROOT, "examples", "proof");
const OUT_ROOT = path.join(ROOT, "output", "proof");

function parseArgs(argv) {
  const opts = {
    filter: null,
    headed: false,
    build: true,
    narrate: false,
    failFast: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--filter") {
      opts.filter = argv[++i] ?? opts.filter;
      continue;
    }
    if (a === "--headed") {
      opts.headed = true;
      continue;
    }
    if (a === "--no-build") {
      opts.build = false;
      continue;
    }
    if (a === "--narrate") {
      opts.narrate = true;
      continue;
    }
    if (a === "--fail-fast") {
      opts.failFast = true;
      continue;
    }
    if (a === "-h" || a === "--help") {
      return { ...opts, help: true };
    }
  }

  return opts;
}

function resolveCommand(cmd) {
  if (process.platform !== "win32") return cmd;
  if (cmd === "pnpm") return "pnpm.cmd";
  if (cmd === "node") return "node.exe";
  return cmd;
}

function run(cmd, args, { cwd }) {
  return new Promise((resolve) => {
    const child = spawn(resolveCommand(cmd), args, {
      cwd,
      stdio: "inherit",
      shell: false,
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function usage() {
  console.log(
    [
      "proof-captures - Run per-component proof specs",
      "",
      "Usage:",
      "  node scripts/proof-captures.mjs [options]",
      "",
      "Options:",
      "  --filter <name>   Run only specs matching <name> (e.g. --filter click)",
      "  --headed          Run browser in headed mode",
      "  --no-build        Skip TypeScript build step",
      "  --narrate         Run edit pipeline with TTS after capture",
      "  --fail-fast       Stop on first failure",
      "  -h, --help        Show this help",
      "",
      "Examples:",
      "  node scripts/proof-captures.mjs",
      "  node scripts/proof-captures.mjs --filter click",
      "  node scripts/proof-captures.mjs --narrate --headed",
    ].join("\n"),
  );
}

async function verifyCaptureArtifacts(outDir) {
  const required = ["video.webm", "events.json", "metadata.json"];
  const missing = [];
  for (const file of required) {
    try {
      await access(path.join(outDir, file));
    } catch {
      missing.push(file);
    }
  }
  return missing;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    process.exit(0);
  }

  // Discover proof specs
  const entries = await readdir(PROOF_DIR, { withFileTypes: true });
  let specs = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => /^proof-.*\.demo\.ya?ml$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(PROOF_DIR, name));

  if (opts.filter) {
    const f = opts.filter.toLowerCase();
    specs = specs.filter((p) => p.toLowerCase().includes(f));
  }

  if (specs.length === 0) {
    console.error("No proof specs matched.");
    process.exit(1);
  }

  console.log(`\nFound ${String(specs.length)} proof spec(s):\n`);
  for (const s of specs) {
    console.log(`  - ${path.basename(s)}`);
  }
  console.log();

  // Build if needed
  if (opts.build) {
    console.log("Building project...\n");
    const code = await run("pnpm", ["-s", "build"], { cwd: ROOT });
    if (code !== 0) {
      console.error("Build failed.");
      process.exit(code);
    }
    console.log();
  }

  await mkdir(OUT_ROOT, { recursive: true });

  const results = [];
  const startAll = Date.now();

  for (const spec of specs) {
    const base = path
      .basename(spec)
      .replace(/\.demo\.ya?ml$/i, "")
      .replaceAll(" ", "-");
    const outDir = path.join(OUT_ROOT, base);
    await mkdir(outDir, { recursive: true });

    const label = path.basename(spec);
    console.log(`--- ${label} ---`);
    const startOne = Date.now();

    // Phase 1: Capture
    const captureArgs = ["dist/cli.js", "capture", spec, "--output", outDir, "--no-narration"];
    if (opts.headed) captureArgs.push("--no-headless");

    const captureCode = await run("node", captureArgs, { cwd: ROOT });
    const elapsedMs = Date.now() - startOne;

    if (captureCode !== 0) {
      console.error(
        `  FAIL  ${label}  (capture exit ${String(captureCode)}, ${String(elapsedMs)}ms)\n`,
      );
      results.push({ spec: label, status: "FAIL", phase: "capture", elapsedMs });
      if (opts.failFast) break;
      continue;
    }

    // Verify artifacts
    const missing = await verifyCaptureArtifacts(outDir);
    if (missing.length > 0) {
      console.error(`  FAIL  ${label}  (missing: ${missing.join(", ")})\n`);
      results.push({ spec: label, status: "FAIL", phase: "verify", elapsedMs });
      if (opts.failFast) break;
      continue;
    }

    // Phase 2: Edit with narration (optional)
    if (opts.narrate) {
      const eventsPath = path.join(outDir, "events.json");
      const editArgs = [
        "dist/cli.js",
        "edit",
        eventsPath,
        "--spec",
        spec,
        "--tts-provider",
        "kokoro",
        "--output",
        outDir,
      ];
      const editCode = await run("node", editArgs, { cwd: ROOT });
      const editElapsed = Date.now() - startOne;
      if (editCode !== 0) {
        console.error(
          `  FAIL  ${label}  (edit exit ${String(editCode)}, ${String(editElapsed)}ms)\n`,
        );
        results.push({ spec: label, status: "FAIL", phase: "edit", elapsedMs: editElapsed });
        if (opts.failFast) break;
        continue;
      }
    }

    const totalElapsed = Date.now() - startOne;
    console.log(`  PASS  ${label}  (${String(totalElapsed)}ms)\n`);
    results.push({ spec: label, status: "PASS", elapsedMs: totalElapsed });
  }

  // Summary
  const totalMs = Date.now() - startAll;
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  console.log("=".repeat(60));
  console.log(`\nProof Capture Summary`);
  console.log(`  Total:   ${String(results.length)}`);
  console.log(`  Passed:  ${String(passed)}`);
  console.log(`  Failed:  ${String(failed)}`);
  console.log(`  Time:    ${String(totalMs)}ms\n`);

  if (failed > 0) {
    console.log("Failures:");
    for (const r of results.filter((r) => r.status === "FAIL")) {
      console.log(`  - ${r.spec} (${r.phase})`);
    }
    console.log();
  }

  console.log(`Output: ${OUT_ROOT}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
