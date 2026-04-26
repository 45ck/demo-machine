#!/usr/bin/env node
/**
 * narration-ab.mjs — A/B voice comparison for demo narration.
 *
 * Takes a single spec (default: todo-app.yaml), renders with multiple
 * Kokoro voice variants, and generates a side-by-side comparison page.
 *
 * Kokoro voices (from kokoro-js / Kokoro-82M-v1.0 model):
 *   af_heart  — female, warm (default)
 *   af_bella  — female, clear
 *   af_nicole — female, neutral
 *   af_sarah  — female, professional
 *   af_sky   — female, bright
 *   am_adam   — male, warm
 *   am_michael — male, clear
 *   bf_emma   — British female
 *   bm_george — British male
 *
 * Note: Available voices depend on the kokoro-js model version installed.
 * The script will attempt each voice and report failures gracefully.
 *
 * Usage:
 *   node scripts/narration-ab.mjs
 *   node scripts/narration-ab.mjs --spec examples/showcase/todo-app.demo.yaml
 *   node scripts/narration-ab.mjs --voices af_heart,af_bella,am_adam
 *   node scripts/narration-ab.mjs --use-existing
 *
 * Output:
 *   output/narration-ab/{slug}-{voice}/  — rendered videos
 *   output/narration-ab/compare.html     — side-by-side comparison page
 *   output/narration-ab/report.json      — metadata
 */
import { spawn } from "node:child_process";
import { readFile, readdir, mkdir, writeFile, access, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

const DEFAULT_VOICES = ["af_heart", "af_bella", "am_adam"];

function parseArgs(argv) {
  const opts = {
    spec: null,
    voices: null,
    useExisting: false,
    provider: "kokoro",
    build: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--spec") {
      opts.spec = argv[++i] ?? null;
    } else if (a === "--voices") {
      opts.voices = (argv[++i] ?? "").split(",").filter(Boolean);
    } else if (a === "--use-existing") {
      opts.useExisting = true;
    } else if (a === "--provider") {
      opts.provider = argv[++i] ?? "kokoro";
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
      "narration-ab — A/B voice comparison for demo narration",
      "",
      "Usage:",
      "  node scripts/narration-ab.mjs [--spec <path>] [--voices <list>]",
      "",
      "Options:",
      "  --spec <path>       Spec file to use (default: examples/showcase/todo-app.demo.yaml)",
      "  --voices <list>     Comma-separated voice IDs (default: af_heart,af_bella,am_adam)",
      "  --use-existing      Skip capture, use existing events.json from output/example-suite/",
      "  --provider <name>   TTS provider (default: kokoro)",
      "  --no-build          Skip pnpm build step",
      "  -h, --help          Show this help message",
      "",
      "Common Kokoro voices:",
      "  af_heart    female, warm (default)",
      "  af_bella    female, clear",
      "  af_nicole   female, neutral",
      "  af_sarah    female, professional",
      "  af_sky      female, bright",
      "  am_adam     male, warm",
      "  am_michael  male, clear",
      "  bf_emma     British female",
      "  bm_george   British male",
      "",
      "Output:",
      "  output/narration-ab/{slug}-{voice}/  rendered videos",
      "  output/narration-ab/compare.html     side-by-side viewer",
      "  output/narration-ab/report.json      metadata",
    ].join("\n"),
  );
}

function resolveCommand(cmd) {
  if (process.platform !== "win32") return cmd;
  if (cmd === "pnpm") return "pnpm.cmd";
  if (cmd === "node") return "node.exe";
  return cmd;
}

function run(cmd, args, { cwd } = { cwd: root }) {
  return new Promise((resolve) => {
    const child = spawn(resolveCommand(cmd), args, {
      cwd: cwd ?? root,
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

async function fileSize(p) {
  try {
    const s = await stat(p);
    return s.size;
  } catch {
    return 0;
  }
}

function slugFromSpec(specPath) {
  return path
    .basename(specPath)
    .replace(/\.demo\.ya?ml$/i, "")
    .replaceAll(" ", "-");
}

function fmtBytes(bytes) {
  if (bytes === 0) return "-";
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateCompareHTML(slug, variants) {
  const cards = variants
    .map((v) => {
      const videoSrc = `${slug}-${v.voice}/output.mp4`;
      const statusClass = v.success ? "success" : "failed";
      const statusLabel = v.success ? "OK" : "FAILED";

      return `
      <div class="card ${statusClass}">
        <div class="card-header">
          <span class="voice-name">${escapeHtml(v.voice)}</span>
          <span class="status-badge ${statusClass}">${statusLabel}</span>
        </div>
        ${
          v.success
            ? `<video controls muted loop playsinline preload="metadata" data-ab-video>
            <source src="${escapeHtml(videoSrc)}" type="video/mp4">
          </video>`
            : `<div class="error-placeholder">Render failed</div>`
        }
        <div class="card-meta">
          <span>MP4: ${fmtBytes(v.mp4Bytes)}</span>
          <span>WAV: ${fmtBytes(v.wavBytes)}</span>
        </div>
      </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Narration A/B — ${escapeHtml(slug)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0d0f14; color: #c8ccd4; font-family: 'Segoe UI', system-ui, sans-serif;
    padding: 24px 32px; line-height: 1.5;
  }
  h1 { color: #e2e6ed; font-size: 1.6rem; margin-bottom: 4px; }
  .subtitle { color: #6b7280; font-size: 0.85rem; margin-bottom: 20px; }

  .controls {
    display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap;
  }
  .controls button {
    background: #1e2230; color: #c8ccd4; border: 1px solid #2d3348;
    padding: 8px 18px; border-radius: 6px; font-size: 0.85rem; cursor: pointer;
    transition: background 0.15s;
  }
  .controls button:hover { background: #2d3348; }
  .controls button.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(480px, 1fr));
    gap: 20px;
  }
  .card {
    background: #161922; border: 1px solid #1e2230; border-radius: 10px;
    overflow: hidden;
  }
  .card.failed { opacity: 0.6; }
  .card-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 16px; border-bottom: 1px solid #1e2230;
  }
  .voice-name { font-weight: 700; font-size: 1rem; color: #e2e6ed; }
  .status-badge {
    font-size: 0.7rem; font-weight: 600; padding: 2px 10px;
    border-radius: 99px; text-transform: uppercase;
  }
  .status-badge.success { background: #064e3b; color: #6ee7b7; }
  .status-badge.failed  { background: #7f1d1d; color: #fca5a5; }

  video {
    width: 100%; display: block; background: #000;
  }
  .error-placeholder {
    height: 270px; display: flex; align-items: center; justify-content: center;
    color: #6b7280; font-size: 0.9rem; background: #0d0f14;
  }
  .card-meta {
    padding: 10px 16px; font-size: 0.78rem; color: #6b7280;
    display: flex; gap: 16px;
  }
</style>
</head>
<body>
  <h1>Narration A/B: ${escapeHtml(slug)}</h1>
  <p class="subtitle">${variants.length} voice variant(s) — generated ${new Date().toISOString()}</p>

  <div class="controls">
    <button id="btn-play-all" onclick="playAll()">Play all</button>
    <button id="btn-pause-all" onclick="pauseAll()">Pause all</button>
    <button id="btn-restart-all" onclick="restartAll()">Restart all</button>
    <button id="btn-mute-toggle" onclick="toggleMute()">Unmute all</button>
  </div>

  <div class="grid">
    ${cards}
  </div>

  <script>
    function getVideos() { return [...document.querySelectorAll('video[data-ab-video]')]; }

    function playAll() {
      getVideos().forEach(v => { v.currentTime = 0; v.play(); });
    }
    function pauseAll() {
      getVideos().forEach(v => v.pause());
    }
    function restartAll() {
      getVideos().forEach(v => { v.currentTime = 0; v.pause(); });
    }
    function toggleMute() {
      const videos = getVideos();
      const allMuted = videos.every(v => v.muted);
      videos.forEach(v => { v.muted = !allMuted; });
      document.getElementById('btn-mute-toggle').textContent = allMuted ? 'Mute all' : 'Unmute all';
    }

    // IntersectionObserver autoplay
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.play().catch(() => {});
        } else {
          entry.target.pause();
        }
      });
    }, { threshold: 0.5 });

    getVideos().forEach(v => observer.observe(v));
  </script>
</body>
</html>`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    usage();
    process.exit(0);
  }

  // Resolve spec
  const defaultSpec = path.join(root, "examples", "showcase", "todo-app.demo.yaml");
  const specPath = opts.spec ? path.resolve(opts.spec) : defaultSpec;

  if (!(await exists(specPath))) {
    console.error(`Spec file not found: ${specPath}`);
    process.exit(1);
  }

  const slug = slugFromSpec(specPath);
  const voices = opts.voices ?? DEFAULT_VOICES;
  const outRoot = path.join(root, "output", "narration-ab");

  await mkdir(outRoot, { recursive: true });

  console.log(`Narration A/B comparison`);
  console.log(`  Spec:     ${specPath}`);
  console.log(`  Slug:     ${slug}`);
  console.log(`  Voices:   ${voices.join(", ")}`);
  console.log(`  Provider: ${opts.provider}`);
  console.log();

  // Build if needed
  if (opts.build) {
    console.log("Building project...");
    const code = await run("pnpm", ["-s", "build"]);
    if (code !== 0) {
      console.error("Build failed.");
      process.exit(code);
    }
    console.log();
  }

  // Determine events source
  let eventsSource;
  const existingSuiteDir = path.join(root, "output", "example-suite", slug);
  const existingEvents = path.join(existingSuiteDir, "events.json");

  if (opts.useExisting) {
    if (!(await exists(existingEvents))) {
      console.error(`--use-existing specified but no events.json found at ${existingEvents}`);
      console.error(
        "Run a capture first: node scripts/examples-suite.mjs --mode capture --filter " + slug,
      );
      process.exit(1);
    }
    eventsSource = existingSuiteDir;
    console.log(`Using existing capture from ${existingSuiteDir}\n`);
  } else {
    // Capture fresh
    const captureDir = path.join(outRoot, `${slug}-capture`);
    await mkdir(captureDir, { recursive: true });

    console.log("Capturing...");
    const captureCode = await run("node", [
      "dist/cli.js",
      "capture",
      specPath,
      "--output",
      captureDir,
      "--overwrite",
      "--no-narration",
    ]);

    if (captureCode !== 0) {
      console.error("Capture failed.");
      process.exit(captureCode);
    }

    eventsSource = captureDir;
    console.log(`Capture complete: ${captureDir}\n`);
  }

  const eventsPath = path.join(eventsSource, "events.json");
  if (!(await exists(eventsPath))) {
    console.error(`events.json not found in ${eventsSource}`);
    process.exit(1);
  }

  // Render each voice variant
  const variants = [];

  for (const voice of voices) {
    const variantDir = path.join(outRoot, `${slug}-${voice}`);
    await mkdir(variantDir, { recursive: true });

    console.log(`  [RENDER] ${voice}`);

    // Copy events.json and video.webm to the variant directory so edit can find them
    const videoSrc = path.join(eventsSource, "video.webm");
    const eventsSrc = eventsPath;

    // The edit command reads events from the given path and looks for video.webm
    // in the same directory (or --output dir). We'll copy to the variant dir.
    const { copyFile } = await import("node:fs/promises");
    try {
      await copyFile(eventsSrc, path.join(variantDir, "events.json"));
      if (await exists(videoSrc)) {
        await copyFile(videoSrc, path.join(variantDir, "video.webm"));
      }
    } catch (err) {
      console.error(`  [FAIL] ${voice} — failed to copy source files: ${err.message}`);
      variants.push({ voice, success: false, mp4Bytes: 0, wavBytes: 0, error: err.message });
      continue;
    }

    const variantEvents = path.join(variantDir, "events.json");

    const args = [
      "dist/cli.js",
      "edit",
      variantEvents,
      "--spec",
      specPath,
      "--output",
      variantDir,
      "--overwrite",
      "--tts-provider",
      opts.provider,
      "--tts-voice",
      voice,
    ];

    const code = await run("node", args);

    if (code !== 0) {
      console.error(`  [FAIL]  ${voice} (exit ${code})`);
      variants.push({
        voice,
        success: false,
        mp4Bytes: 0,
        wavBytes: 0,
        error: `exit code ${code}`,
      });
      continue;
    }

    const mp4Bytes = await fileSize(path.join(variantDir, "output.mp4"));
    const wavBytes = await fileSize(path.join(variantDir, "narration.wav"));

    console.log(`  [DONE]  ${voice} — MP4: ${fmtBytes(mp4Bytes)}, WAV: ${fmtBytes(wavBytes)}`);

    variants.push({ voice, success: true, mp4Bytes, wavBytes, error: null });
  }

  console.log();

  // Generate comparison HTML
  const htmlPath = path.join(outRoot, "compare.html");
  await writeFile(htmlPath, generateCompareHTML(slug, variants), "utf8");

  // Generate report JSON
  const report = {
    generatedAt: new Date().toISOString(),
    spec: specPath,
    slug,
    provider: opts.provider,
    voices,
    eventsSource,
    variants,
    summary: {
      total: variants.length,
      successful: variants.filter((v) => v.success).length,
      failed: variants.filter((v) => !v.success).length,
    },
  };

  const reportPath = path.join(outRoot, "report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  // Generate a serve script for the comparison viewer
  const servePath = path.join(outRoot, "serve.mjs");
  await writeFile(
    servePath,
    `#!/usr/bin/env node
// Serves output/narration-ab/ over HTTP so videos play correctly in browsers.
// Usage: node output/narration-ab/serve.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5556;

const MIME = {
  ".html": "text/html",
  ".mp4":  "video/mp4",
  ".webm": "video/webm",
  ".js":   "text/javascript",
  ".css":  "text/css",
  ".json": "application/json",
  ".wav":  "audio/wav",
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/compare.html";

  const filePath = path.join(ROOT, urlPath);

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";
    const range = req.headers.range;

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr, 10);
      const end   = endStr ? parseInt(endStr, 10) : stat.size - 1;
      const chunk = end - start + 1;

      res.writeHead(206, {
        "Content-Range":  \`bytes \${start}-\${end}/\${stat.size}\`,
        "Accept-Ranges":  "bytes",
        "Content-Length": chunk,
        "Content-Type":   mime,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": stat.size,
        "Content-Type":   mime,
        "Accept-Ranges":  "bytes",
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(\`Narration A/B viewer -> http://localhost:\${PORT}\`);
});
`,
    "utf8",
  );

  // Summary
  const successCount = variants.filter((v) => v.success).length;
  const failCount = variants.filter((v) => !v.success).length;

  console.log(`Results: ${successCount} succeeded, ${failCount} failed`);
  console.log();
  console.log(`Output:`);
  console.log(`  HTML:   ${htmlPath}`);
  console.log(`  JSON:   ${reportPath}`);
  console.log(`  Serve:  node output/narration-ab/serve.mjs`);
  console.log(`          Then open http://localhost:5556`);

  process.exit(failCount === variants.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
