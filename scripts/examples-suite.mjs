#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const opts = {
    mode: "validate", // validate | capture | run
    filter: null,
    limit: null,
    headed: false,
    build: true,
    failFast: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode") {
      opts.mode = argv[++i] ?? opts.mode;
      continue;
    }
    if (a === "--filter") {
      opts.filter = argv[++i] ?? opts.filter;
      continue;
    }
    if (a === "--limit") {
      const raw = argv[++i];
      opts.limit = raw ? Number(raw) : opts.limit;
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
    if (a === "--no-fail-fast") {
      opts.failFast = false;
      continue;
    }
    if (a === "-h" || a === "--help") {
      return { ...opts, help: true };
    }
  }

  return opts;
}

function run(cmd, args, { cwd }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      shell: true, // makes pnpm/node resolution work consistently on Windows
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function usage() {
  // Keep this minimal; intended for humans running locally.
  // Use `pnpm examples:*` scripts for the common paths.
  console.log(
    [
      "examples-suite",
      "",
      "Usage:",
      "  node scripts/examples-suite.mjs [--mode validate|capture|run] [--filter <substring>] [--limit <n>] [--headed] [--no-build] [--no-fail-fast]",
      "",
      "Examples:",
      "  node scripts/examples-suite.mjs --mode validate",
      "  node scripts/examples-suite.mjs --mode capture --filter spa-router",
    ].join("\n"),
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    process.exit(0);
  }

  if (!["validate", "capture", "run"].includes(opts.mode)) {
    console.error(`Unknown --mode: ${opts.mode}`);
    process.exit(2);
  }
  if (opts.limit != null && (!Number.isFinite(opts.limit) || opts.limit <= 0)) {
    console.error(`Invalid --limit: ${String(opts.limit)}`);
    process.exit(2);
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, "..");
  const examplesDir = path.join(root, "examples");

  const entries = await readdir(examplesDir, { withFileTypes: true });
  let specs = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => /\.demo\.ya?ml$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(examplesDir, name));

  if (opts.filter) {
    const f = opts.filter.toLowerCase();
    specs = specs.filter((p) => p.toLowerCase().includes(f));
  }
  if (opts.limit != null) {
    specs = specs.slice(0, opts.limit);
  }

  if (specs.length === 0) {
    console.error("No example specs matched.");
    process.exit(1);
  }

  if (opts.build) {
    const code = await run("pnpm", ["-s", "build"], { cwd: root });
    if (code !== 0) process.exit(code);
  }

  const outRoot = path.join(root, "output", "example-suite");
  await mkdir(outRoot, { recursive: true });

  let failures = 0;
  for (const spec of specs) {
    const base = path
      .basename(spec)
      .replace(/\.demo\.ya?ml$/i, "")
      .replaceAll(" ", "-");
    const outDir = path.join(outRoot, base);

    const args = ["dist/cli.js", opts.mode, spec];
    if (opts.mode !== "validate") {
      // Keep suite runs lightweight: no narration, and avoid post-processing unless explicitly requested.
      args.push("--output", outDir, "--no-narration");
      if (opts.mode === "run") args.push("--no-edit");
      if (opts.headed) args.push("--no-headless");
    }

    const code = await run("node", args, { cwd: root });
    if (code !== 0) {
      failures++;
      if (opts.failFast) process.exit(code);
    }
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
