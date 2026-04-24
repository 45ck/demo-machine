#!/usr/bin/env node
// meta-demo-capture.mjs
// Captures the "meta-demo" — demo-machine recording its own review viewer.
//
// Steps:
//   1. Ensures the review server (output/example-suite/serve.mjs) is running
//   2. Runs `demo-machine run` on the meta-demo spec
//   3. Cleans up the server if we started it
//
// Usage:
//   node scripts/meta-demo-capture.mjs [--headed] [--no-narration] [--no-edit] [--skip-build]

import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SPEC = path.join(ROOT, "examples", "meta-demo.demo.yaml");
const OUTPUT_DIR = path.join(ROOT, "output", "meta-demo");
const SERVE_SCRIPT = path.join(ROOT, "output", "example-suite", "serve.mjs");
const SERVER_PORT = 5555;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// ── Helpers ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    headed: false,
    narration: true,
    edit: true,
    build: true,
  };

  for (const a of argv) {
    if (a === "--headed") opts.headed = true;
    if (a === "--no-narration") opts.narration = false;
    if (a === "--no-edit") opts.edit = false;
    if (a === "--skip-build") opts.build = false;
    if (a === "-h" || a === "--help") return { ...opts, help: true };
  }

  return opts;
}

function usage() {
  console.log(
    [
      "meta-demo-capture",
      "",
      "Captures the meta-demo: demo-machine recording its own review viewer.",
      "",
      "Usage:",
      "  node scripts/meta-demo-capture.mjs [--headed] [--no-narration] [--no-edit] [--skip-build]",
      "",
      "Options:",
      "  --headed         Run browser in headed mode (visible window)",
      "  --no-narration   Skip TTS narration",
      "  --no-edit        Raw capture only, no editing pass",
      "  --skip-build     Skip the TypeScript build step",
      "",
      "Prerequisites:",
      "  The example-suite videos must exist in output/example-suite/.",
      "  Run `node scripts/examples-suite.mjs --mode run` first if needed.",
    ].join("\n"),
  );
}

function resolveCommand(cmd) {
  if (process.platform !== "win32") return cmd;
  if (cmd === "pnpm") return "pnpm.cmd";
  return cmd;
}

function run(cmd, args, { cwd }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: true });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether the review server is already listening.
 */
function isServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(SERVER_URL, (res) => {
      res.resume(); // drain
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Start the review server as a background child process.
 * Returns the ChildProcess handle.
 */
function startServer() {
  console.log(`\n  Starting review server: node ${SERVE_SCRIPT}`);
  const child = spawn("node", [SERVE_SCRIPT], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    shell: false,
  });

  // Log server output with a prefix
  child.stdout.on("data", (d) => process.stdout.write(`  [serve] ${d.toString("utf8")}`));
  child.stderr.on("data", (d) => process.stderr.write(`  [serve] ${d.toString("utf8")}`));

  return child;
}

/**
 * Wait until the review server responds to HTTP requests.
 */
async function waitForServer(maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isServerRunning()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Review server did not become ready within ${maxWaitMs}ms at ${SERVER_URL}`);
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    process.exit(0);
  }

  console.log("meta-demo-capture");
  console.log("=================\n");

  // 1. Verify prerequisites
  if (!(await fileExists(SERVE_SCRIPT))) {
    console.error(
      `ERROR: Review server not found at ${SERVE_SCRIPT}\n` +
        "Run the example suite first:\n" +
        "  node scripts/examples-suite.mjs --mode run\n",
    );
    process.exit(1);
  }

  if (!(await fileExists(SPEC))) {
    console.error(`ERROR: Meta-demo spec not found at ${SPEC}`);
    process.exit(1);
  }

  // 2. Build TypeScript if needed
  if (opts.build) {
    console.log("  Building project...");
    const code = await run(resolveCommand("pnpm"), ["-s", "build"], {
      cwd: ROOT,
    });
    if (code !== 0) {
      console.error("Build failed.");
      process.exit(code);
    }
  }

  // 3. Ensure the review server is running
  let serverChild = null;
  let weStartedServer = false;

  if (await isServerRunning()) {
    console.log(`  Review server already running at ${SERVER_URL}`);
  } else {
    serverChild = startServer();
    weStartedServer = true;
    await waitForServer();
    console.log(`  Review server ready at ${SERVER_URL}\n`);
  }

  // 4. Create output directory
  await mkdir(OUTPUT_DIR, { recursive: true });

  // 5. Run the full pipeline (capture + edit + narration)
  try {
    const cliArgs = ["dist/cli.js", "run", SPEC, "--output", OUTPUT_DIR, "--overwrite"];

    if (!opts.narration) {
      cliArgs.push("--no-narration");
    } else {
      cliArgs.push("--tts-provider", "kokoro");
    }

    if (!opts.edit) {
      cliArgs.push("--no-edit");
    }

    if (opts.headed) {
      cliArgs.push("--no-headless");
    }

    console.log(`  Running: node ${cliArgs.join(" ")}\n`);
    const code = await run("node", cliArgs, { cwd: ROOT });

    if (code !== 0) {
      console.error(`\nCapture pipeline exited with code ${code}`);
      process.exit(code);
    }

    // 6. Report results
    const mp4Path = path.join(OUTPUT_DIR, "output.mp4");
    if (await fileExists(mp4Path)) {
      const mp4Stat = await stat(mp4Path);
      const sizeMb = (mp4Stat.size / (1024 * 1024)).toFixed(1);
      console.log(`\n  Meta-demo rendered successfully!`);
      console.log(`  Output: ${mp4Path}`);
      console.log(`  Size:   ${sizeMb} MB\n`);
    } else {
      console.log(`\n  Capture complete. Output at: ${OUTPUT_DIR}`);
    }
  } finally {
    // 7. Clean up the server if we started it
    if (weStartedServer && serverChild) {
      console.log("  Stopping review server...");
      serverChild.kill("SIGTERM");
      // Give it a moment to exit gracefully
      await new Promise((r) => setTimeout(r, 500));
      if (!serverChild.killed) {
        serverChild.kill("SIGKILL");
      }
      console.log("  Server stopped.\n");
    }
  }
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
