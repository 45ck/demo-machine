#!/usr/bin/env node
/**
 * narrate-suite.mjs
 *
 * Re-renders all captured demos with narration from their original spec files.
 * Uses existing events.json + video.webm — no re-capture needed.
 *
 * Usage:
 *   node scripts/narrate-suite.mjs [--filter <name>] [--provider kokoro|openai|elevenlabs] [--voice <id>]
 *
 * Output videos land at: output/example-suite/{name}/output.mp4
 * The review viewer reads from this path directly.
 */

import { spawn } from "node:child_process";
import { readdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

function parseArgs(argv) {
  const opts = { filter: null, provider: "kokoro", voice: null, concurrency: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--filter")   { opts.filter   = argv[++i] ?? null; continue; }
    if (a === "--provider") { opts.provider = argv[++i] ?? "kokoro"; continue; }
    if (a === "--voice")    { opts.voice    = argv[++i] ?? null; continue; }
    if (a === "--concurrency") { opts.concurrency = Number(argv[++i] ?? 1); continue; }
  }
  return opts;
}

function run(cmd, args, { cwd } = { cwd: root }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: true });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const examplesDir = path.join(root, "examples");
  const outRoot     = path.join(root, "output", "example-suite");

  const entries = await readdir(examplesDir, { withFileTypes: true });
  let specs = entries
    .filter(e => e.isFile() && /\.demo\.ya?ml$/i.test(e.name))
    .map(e => ({
      name:     e.name.replace(/\.demo\.ya?ml$/i, ""),
      specPath: path.join(examplesDir, e.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (opts.filter) {
    const f = opts.filter.toLowerCase();
    specs = specs.filter(s => s.name.toLowerCase().includes(f));
  }

  if (specs.length === 0) {
    console.error("No specs matched.");
    process.exit(1);
  }

  console.log(`\nNarrating ${specs.length} demo(s) — provider: ${opts.provider}\n`);

  let failures = 0;

  // Process in batches of opts.concurrency
  for (let i = 0; i < specs.length; i += opts.concurrency) {
    const batch = specs.slice(i, i + opts.concurrency);

    const tasks = batch.map(async ({ name, specPath }) => {
      const captureDir = path.join(outRoot, name);
      const eventsPath = path.join(captureDir, "events.json");
      const videoPath  = path.join(captureDir, "video.webm");

      if (!(await exists(eventsPath)) || !(await exists(videoPath))) {
        console.error(`  [SKIP] ${name} — no capture found (run examples-suite capture first)`);
        return 1;
      }

      console.log(`  [START] ${name}`);

      const args = [
        "dist/cli.js", "edit", eventsPath,
        "--spec", specPath,
        "--output", captureDir,
        "--tts-provider", opts.provider,
      ];
      if (opts.voice) args.push("--tts-voice", opts.voice);

      const code = await run("node", args);
      if (code !== 0) {
        console.error(`  [FAIL]  ${name}`);
        return 1;
      }
      console.log(`  [DONE]  ${name}`);
      return 0;
    });

    const results = await Promise.all(tasks);
    failures += results.filter(c => c !== 0).length;
  }

  console.log(`\n${specs.length - failures}/${specs.length} succeeded.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err?.stack ?? String(err)); process.exit(1); });
