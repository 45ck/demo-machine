#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

const SHOWCASE = [
  { slug: "todo-app", spec: "examples/todo-app.demo.yaml", title: "TaskFlow (Tasks)" },
  { slug: "form-wizard", spec: "examples/form-wizard.demo.yaml", title: "FlowForm (Wizard)" },
  { slug: "auth-otp", spec: "examples/auth-otp.demo.yaml", title: "AuthFlow (OTP)" },
  { slug: "modals-popovers", spec: "examples/modals-popovers.demo.yaml", title: "OverlayKit" },
  { slug: "spa-router", spec: "examples/spa-router.demo.yaml", title: "RouteLab (SPA)" },
  { slug: "infinite-scroll", spec: "examples/infinite-scroll.demo.yaml", title: "ScrollForge" },
  {
    slug: "dashboard-table",
    spec: "examples/dashboard-table.demo.yaml",
    title: "DashLite (Table)",
  },
  { slug: "controls-lab", spec: "examples/controls-lab.demo.yaml", title: "ControlRoom (Inputs)" },
  {
    slug: "chart-tooltips",
    spec: "examples/chart-tooltips.demo.yaml",
    title: "ChartLab (Tooltips)",
  },
  { slug: "virtual-table", spec: "examples/virtual-table.demo.yaml", title: "GridV (Virtualized)" },
  {
    slug: "selector-stress",
    spec: "examples/selector-stress.demo.yaml",
    title: "SelectorGym (nth)",
  },
];

function parseArgs(argv) {
  const opts = {
    outDir: "assets/demo-gallery",
    tmpDir: "output/demo-gallery",
    limit: null,
    filter: null,
    regen: false,
    headed: false,
    updateTodoMp4: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") {
      opts.outDir = argv[++i] ?? opts.outDir;
      continue;
    }
    if (a === "--tmp") {
      opts.tmpDir = argv[++i] ?? opts.tmpDir;
      continue;
    }
    if (a === "--limit") {
      const raw = argv[++i];
      opts.limit = raw ? Number(raw) : opts.limit;
      continue;
    }
    if (a === "--filter") {
      opts.filter = argv[++i] ?? opts.filter;
      continue;
    }
    if (a === "--regen") {
      opts.regen = true;
      continue;
    }
    if (a === "--headed") {
      opts.headed = true;
      continue;
    }
    if (a === "--no-update-todo-mp4") {
      opts.updateTodoMp4 = false;
      continue;
    }
    if (a === "-h" || a === "--help") return { ...opts, help: true };
  }

  return opts;
}

function usage() {
  console.log(
    [
      "demo-gallery",
      "",
      "Generates GIF previews + 5 screenshots per showcase demo and updates docs.",
      "",
      "Usage:",
      "  node scripts/demo-gallery.mjs [--out <dir>] [--tmp <dir>] [--filter <substring>] [--limit <n>] [--regen] [--headed] [--no-update-todo-mp4]",
      "",
      "Notes:",
      "  - Requires ffmpeg + ffprobe on PATH.",
      "  - Uses `demo-machine run` (headless by default) to render an MP4 per demo.",
    ].join("\n"),
  );
}

function run(cmd, args, { cwd }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: true });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function runCapture(cmd, args, { cwd }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], shell: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
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

async function sha256(p) {
  const buf = await readFile(p);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function ffprobeDurationSeconds(mp4Path, { cwd }) {
  const res = await runCapture(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      mp4Path,
    ],
    { cwd },
  );
  if (res.code !== 0) {
    throw new Error(`ffprobe failed for ${mp4Path}\n${res.stderr}`);
  }
  const v = Number(String(res.stdout).trim());
  if (!Number.isFinite(v) || v <= 0)
    throw new Error(`Invalid duration from ffprobe: ${res.stdout}`);
  return v;
}

async function ffprobeImageDimensions(imgPath, { cwd }) {
  const res = await runCapture(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0:s=x",
      imgPath,
    ],
    { cwd },
  );
  if (res.code !== 0) {
    throw new Error(`ffprobe failed for ${imgPath}\n${res.stderr}`);
  }
  const raw = String(res.stdout).trim();
  const [w, h] = raw.split("x").map((n) => Number(n));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error(`Invalid image dimensions from ffprobe: ${raw}`);
  }
  return { width: w, height: h };
}

function screenshotTimes(durationSec, count) {
  const times = [];
  for (let i = 1; i <= count; i++) {
    const t = (durationSec * i) / (count + 1);
    times.push(Math.max(0, Math.min(durationSec - 0.05, t)));
  }
  return times;
}

function gifWindow(durationSec) {
  const start = Math.min(2, durationSec * 0.15);
  const maxLen = 8;
  const len = Math.min(maxLen, Math.max(4, durationSec - start - 0.25));
  return { start, len };
}

async function generateWebpFrame({ mp4Path, outPath, timeSec, cwd }) {
  const code = await run(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      timeSec.toFixed(3),
      "-i",
      mp4Path,
      "-frames:v",
      "1",
      "-vf",
      "scale=960:-2:flags=lanczos",
      "-c:v",
      "libwebp",
      "-q:v",
      "82",
      outPath,
    ],
    { cwd },
  );
  if (code !== 0) throw new Error(`ffmpeg frame failed: ${outPath}`);
}

async function generateGif({ mp4Path, outPath, startSec, lenSec, cwd }) {
  // High-quality GIF using palette generation.
  const vf =
    "fps=12,scale=960:-2:flags=lanczos,split[s0][s1];" +
    "[s0]palettegen=stats_mode=diff[p];" +
    "[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle";

  const code = await run(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      startSec.toFixed(3),
      "-t",
      lenSec.toFixed(3),
      "-i",
      mp4Path,
      "-vf",
      vf,
      "-loop",
      "0",
      outPath,
    ],
    { cwd },
  );
  if (code !== 0) throw new Error(`ffmpeg gif failed: ${outPath}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    process.exit(0);
  }
  if (opts.limit != null && (!Number.isFinite(opts.limit) || opts.limit <= 0)) {
    console.error(`Invalid --limit: ${String(opts.limit)}`);
    process.exit(2);
  }

  const root = process.cwd();
  const outDir = path.resolve(root, opts.outDir);
  const tmpDir = path.resolve(root, opts.tmpDir);

  await mkdir(outDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  // Build first so dist/cli.js exists.
  {
    const code = await run("pnpm", ["-s", "build"], { cwd: root });
    if (code !== 0) process.exit(code);
  }

  // Validate ffmpeg tooling early.
  {
    const ok1 = await run("ffmpeg", ["-version"], { cwd: root });
    const ok2 = await run("ffprobe", ["-version"], { cwd: root });
    if (ok1 !== 0 || ok2 !== 0) {
      console.error("ffmpeg/ffprobe are required on PATH.");
      process.exit(2);
    }
  }

  let demos = SHOWCASE.slice();
  if (opts.filter) {
    const f = opts.filter.toLowerCase();
    demos = demos.filter((d) => d.slug.includes(f) || d.spec.toLowerCase().includes(f));
  }
  if (opts.limit != null) demos = demos.slice(0, opts.limit);
  if (demos.length === 0) {
    console.error("No showcase demos matched.");
    process.exit(1);
  }

  const results = [];
  for (const demo of demos) {
    const specPath = path.resolve(root, demo.spec);
    const tmpOut = path.join(tmpDir, demo.slug);
    await mkdir(tmpOut, { recursive: true });

    const mp4Path = path.join(tmpOut, "output.mp4");
    if (opts.regen || !(await fileExists(mp4Path))) {
      const args = ["dist/cli.js", "run", specPath, "--output", tmpOut, "--no-narration"];
      if (opts.headed) args.push("--no-headless");
      const code = await run("node", args, { cwd: root });
      if (code !== 0) process.exit(code);
    }

    const durationSec = await ffprobeDurationSeconds(mp4Path, { cwd: root });
    const times = screenshotTimes(durationSec, 5);
    const frames = [];
    for (let i = 0; i < times.length; i++) {
      const n = String(i + 1).padStart(2, "0");
      const framePath = path.join(outDir, `${demo.slug}-${n}.webp`);
      if (opts.regen || !(await fileExists(framePath))) {
        await generateWebpFrame({ mp4Path, outPath: framePath, timeSec: times[i], cwd: root });
      }
      frames.push(path.relative(root, framePath).replaceAll("\\", "/"));
    }

    const gifPath = path.join(outDir, `${demo.slug}.gif`);
    if (opts.regen || !(await fileExists(gifPath))) {
      const w = gifWindow(durationSec);
      await generateGif({ mp4Path, outPath: gifPath, startSec: w.start, lenSec: w.len, cwd: root });
    }

    // Basic sanity checks to catch obvious broken outputs.
    const gifStat = await stat(gifPath);
    if (gifStat.size < 25_000) {
      throw new Error(`GIF looks too small (${String(gifStat.size)} bytes): ${gifPath}`);
    }
    const frameHashes = new Set();
    for (const f of frames) {
      const abs = path.resolve(root, f);
      const st = await stat(abs);
      if (st.size < 2_000)
        throw new Error(`Frame looks too small (${String(st.size)} bytes): ${f}`);
      const dim = await ffprobeImageDimensions(abs, { cwd: root });
      if (dim.width < 900 || dim.height < 400) {
        throw new Error(`Frame dimensions look wrong (${dim.width}x${dim.height}): ${f}`);
      }
      frameHashes.add(await sha256(abs));
    }
    if (frameHashes.size <= 2) {
      throw new Error(
        `Frames look duplicated for "${demo.slug}" (only ${String(frameHashes.size)} unique).`,
      );
    }

    results.push({
      ...demo,
      spec: demo.spec,
      mp4: path.relative(root, mp4Path).replaceAll("\\", "/"),
      gif: path.relative(root, gifPath).replaceAll("\\", "/"),
      frames,
      durationSec: Number(durationSec.toFixed(2)),
    });
  }

  // Update the canonical README demo mp4 so it stays in sync with current visuals.
  if (opts.updateTodoMp4) {
    const todo = results.find((r) => r.slug === "todo-app");
    if (todo) {
      const target = path.resolve(root, "examples", "todo-app-demo.mp4");
      // Re-run todo with narration for the README (keeps the existing README claims true).
      const tmpOut = path.join(tmpDir, "todo-app-narrated");
      await mkdir(tmpOut, { recursive: true });
      const narrated = path.join(tmpOut, "output.mp4");
      const args = [
        "dist/cli.js",
        "run",
        path.resolve(root, "examples/todo-app.demo.yaml"),
        "--output",
        tmpOut,
      ];
      if (opts.headed) args.push("--no-headless");
      const code = await run("node", args, { cwd: root });
      if (code !== 0) process.exit(code);
      await writeFile(target, await readFile(narrated));
    }
  }

  const manifestPath = path.join(outDir, "manifest.json");
  await writeFile(
    manifestPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2) + "\n",
  );

  const docsPath = path.resolve(root, "docs", "demo-gallery.md");
  await mkdir(path.dirname(docsPath), { recursive: true });

  const galleryMd = [
    "# Demo Gallery",
    "",
    "This page is generated by `pnpm demo:gallery`.",
    "",
    ...results.flatMap((r) => {
      const framesRow = r.frames.map((f) => `![](${path.posix.relative("docs", f)})`).join(" ");
      return [
        `## ${r.title}`,
        "",
        `- Spec: \`${r.spec}\``,
        `- Preview MP4 (local build output): \`${r.mp4}\``,
        `- Duration: ${String(r.durationSec)}s`,
        "",
        `![](${path.posix.relative("docs", r.gif)})`,
        "",
        framesRow,
        "",
      ];
    }),
  ].join("\n");

  await writeFile(docsPath, galleryMd);
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
