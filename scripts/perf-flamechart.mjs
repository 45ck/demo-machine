#!/usr/bin/env node
/**
 * perf-flamechart.mjs — Performance breakdown per demo.
 *
 * Scans output directories, reads metadata.json + events.json + file stats,
 * computes per-demo phase breakdowns, and generates:
 *   - output/perf-report.html  (visual stacked-bar chart)
 *   - output/perf-report.json  (raw data)
 *
 * Usage:
 *   node scripts/perf-flamechart.mjs
 *   node scripts/perf-flamechart.mjs --output-dir output/example-suite
 *   node scripts/perf-flamechart.mjs --filter todo-app
 */
import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

function parseArgs(argv) {
  const opts = { outputDir: path.join(root, "output", "example-suite"), filter: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--output-dir") {
      opts.outputDir = path.resolve(argv[++i] ?? opts.outputDir);
    } else if (a === "--filter") {
      opts.filter = argv[++i] ?? null;
    } else if (a === "-h" || a === "--help") {
      opts.help = true;
    }
  }
  return opts;
}

function usage() {
  console.log(
    [
      "perf-flamechart — Performance breakdown per demo",
      "",
      "Usage:",
      "  node scripts/perf-flamechart.mjs [--output-dir <dir>] [--filter <slug>]",
      "",
      "Options:",
      "  --output-dir <dir>  Root output directory (default: output/example-suite)",
      "  --filter <slug>     Only include demos matching this substring",
      "  -h, --help          Show this help message",
      "",
      "Generates:",
      "  output/perf-report.html  — visual stacked-bar chart",
      "  output/perf-report.json  — raw data",
    ].join("\n"),
  );
}

async function exists(p) {
  try {
    await stat(p);
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

async function analyseDemo(demoDir, slug) {
  const metadataPath = path.join(demoDir, "metadata.json");
  const eventsPath = path.join(demoDir, "events.json");

  if (!(await exists(metadataPath)) || !(await exists(eventsPath))) {
    return null;
  }

  let metadata;
  let events;
  try {
    metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    events = JSON.parse(await readFile(eventsPath, "utf8"));
  } catch {
    console.error(`  [SKIP] ${slug} — failed to parse metadata/events`);
    return null;
  }

  if (!Array.isArray(events) || events.length === 0) {
    console.error(`  [SKIP] ${slug} — empty events`);
    return null;
  }

  const startTimestamp = metadata.startTimestamp ?? events[0].timestamp;

  // Compute per-action durations and classify
  let navigationMs = 0;
  let actionMs = 0;
  let waitMs = 0;
  let assertMs = 0;
  const actionBreakdown = [];

  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];
  const captureSpanMs =
    lastEvent.timestamp + (lastEvent.duration ?? 0) - firstEvent.timestamp;

  // Find the first non-navigate action to compute navigation time
  let firstNonNavIdx = events.findIndex(
    (e) => e.action !== "navigate" && e.action !== "wait" && e.action !== "assert",
  );
  if (firstNonNavIdx === -1) firstNonNavIdx = events.length;

  // Navigation time: from start to first interactive action
  if (firstNonNavIdx > 0 && firstNonNavIdx < events.length) {
    navigationMs = events[firstNonNavIdx].timestamp - firstEvent.timestamp;
  } else {
    // All navigates/waits — count entire span as navigation
    navigationMs = captureSpanMs;
  }

  for (const event of events) {
    const dur = event.duration ?? 0;
    const entry = { action: event.action, durationMs: dur, selector: event.selector };
    actionBreakdown.push(entry);

    if (event.action === "wait") {
      waitMs += dur;
    } else if (event.action === "assert") {
      assertMs += dur;
    } else if (event.action === "navigate") {
      // Navigation duration counted in navigationMs above
    } else {
      actionMs += dur;
    }
  }

  // Overhead: time not accounted for by event durations (gaps between events)
  const sumAllDurations = events.reduce((sum, e) => sum + (e.duration ?? 0), 0);
  const overheadMs = Math.max(0, captureSpanMs - sumAllDurations);

  // Stat output files
  const mp4Size = await fileSize(path.join(demoDir, "output.mp4"));
  const webmSize = await fileSize(path.join(demoDir, "video.webm"));
  const traceSize = await fileSize(path.join(demoDir, "trace.zip"));

  return {
    slug,
    specTitle: metadata.specTitle ?? slug,
    captureSpanMs,
    navigationMs,
    actionMs,
    waitMs,
    assertMs,
    overheadMs,
    actionCount: events.length,
    actionBreakdown,
    files: {
      mp4Bytes: mp4Size,
      webmBytes: webmSize,
      traceBytes: traceSize,
    },
    bottlenecks: detectBottlenecks({ navigationMs, actionMs, waitMs, overheadMs, captureSpanMs }),
  };
}

function detectBottlenecks({ navigationMs, actionMs, waitMs, overheadMs, captureSpanMs }) {
  const flags = [];
  const total = captureSpanMs || 1;
  if (navigationMs / total > 0.5) flags.push("navigation >50%");
  if (actionMs / total > 0.5) flags.push("actions >50%");
  if (waitMs / total > 0.5) flags.push("waits >50%");
  if (overheadMs / total > 0.5) flags.push("overhead >50%");
  return flags;
}

function fmtMs(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function fmtBytes(bytes) {
  if (bytes === 0) return "-";
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function generateHTML(demos) {
  const maxDuration = Math.max(...demos.map((d) => d.captureSpanMs), 1);

  const rows = demos
    .map((d) => {
      const total = d.captureSpanMs || 1;
      const navPct = ((d.navigationMs / total) * 100).toFixed(1);
      const actPct = ((d.actionMs / total) * 100).toFixed(1);
      const waitPct = ((d.waitMs / total) * 100).toFixed(1);
      const overPct = ((d.overheadMs / total) * 100).toFixed(1);
      const barWidth = ((d.captureSpanMs / maxDuration) * 100).toFixed(1);
      const bottleneckHtml =
        d.bottlenecks.length > 0
          ? `<span class="bottleneck">${d.bottlenecks.join(", ")}</span>`
          : "";

      return `
      <tr>
        <td class="slug">${escapeHtml(d.slug)}</td>
        <td class="duration">${fmtMs(d.captureSpanMs)}</td>
        <td class="bar-cell">
          <div class="bar-container" style="width:${barWidth}%">
            <div class="bar-seg nav" style="width:${navPct}%" title="Navigation: ${fmtMs(d.navigationMs)} (${navPct}%)"></div>
            <div class="bar-seg act" style="width:${actPct}%" title="Actions: ${fmtMs(d.actionMs)} (${actPct}%)"></div>
            <div class="bar-seg wait" style="width:${waitPct}%" title="Waits: ${fmtMs(d.waitMs)} (${waitPct}%)"></div>
            <div class="bar-seg over" style="width:${overPct}%" title="Overhead: ${fmtMs(d.overheadMs)} (${overPct}%)"></div>
          </div>
        </td>
        <td class="actions-count">${d.actionCount}</td>
        <td class="file-size">${fmtBytes(d.files.mp4Bytes)}</td>
        <td class="bottleneck-cell">${bottleneckHtml}</td>
      </tr>`;
    })
    .join("\n");

  const detailRows = demos
    .map(
      (d) => `
      <tr>
        <td>${escapeHtml(d.slug)}</td>
        <td class="num">${fmtMs(d.navigationMs)}</td>
        <td class="num">${fmtMs(d.actionMs)}</td>
        <td class="num">${fmtMs(d.waitMs)}</td>
        <td class="num">${fmtMs(d.overheadMs)}</td>
        <td class="num">${fmtMs(d.captureSpanMs)}</td>
        <td class="num">${fmtBytes(d.files.mp4Bytes)}</td>
        <td class="num">${fmtBytes(d.files.webmBytes)}</td>
        <td class="num">${fmtBytes(d.files.traceBytes)}</td>
      </tr>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Performance Flamechart — demo-machine</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0d0f14; color: #c8ccd4; font-family: 'Segoe UI', system-ui, sans-serif;
    padding: 24px 32px; line-height: 1.5;
  }
  h1 { color: #e2e6ed; font-size: 1.6rem; margin-bottom: 6px; }
  h2 { color: #a0a8b8; font-size: 1.1rem; margin: 28px 0 12px; }
  .subtitle { color: #6b7280; font-size: 0.85rem; margin-bottom: 24px; }
  .legend {
    display: flex; gap: 18px; margin-bottom: 20px; flex-wrap: wrap;
  }
  .legend-item {
    display: flex; align-items: center; gap: 6px; font-size: 0.82rem; color: #9ca3af;
  }
  .legend-swatch {
    width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0;
  }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th {
    text-align: left; padding: 8px 10px; color: #6b7280; font-size: 0.75rem;
    text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #1e2230;
  }
  td { padding: 6px 10px; border-bottom: 1px solid #161922; font-size: 0.85rem; }
  .slug { font-weight: 600; color: #d1d5e0; white-space: nowrap; }
  .duration { color: #9ca3af; white-space: nowrap; text-align: right; }
  .actions-count { text-align: center; color: #9ca3af; }
  .file-size { text-align: right; color: #9ca3af; white-space: nowrap; }
  .num { text-align: right; color: #9ca3af; font-variant-numeric: tabular-nums; }
  .bar-cell { width: 50%; }
  .bar-container {
    display: flex; height: 22px; border-radius: 4px; overflow: hidden;
    min-width: 4px; background: #1a1d28;
  }
  .bar-seg { height: 100%; min-width: 1px; }
  .bar-seg.nav  { background: #3b82f6; }
  .bar-seg.act  { background: #22c55e; }
  .bar-seg.wait { background: #f59e0b; }
  .bar-seg.over { background: #6366f1; }
  .bottleneck-cell { white-space: nowrap; }
  .bottleneck {
    background: #7f1d1d; color: #fca5a5; padding: 2px 8px; border-radius: 4px;
    font-size: 0.75rem; font-weight: 500;
  }
  .summary {
    display: flex; gap: 32px; margin-bottom: 24px; flex-wrap: wrap;
  }
  .summary-card {
    background: #161922; border: 1px solid #1e2230; border-radius: 8px;
    padding: 14px 20px; min-width: 140px;
  }
  .summary-card .label { color: #6b7280; font-size: 0.75rem; text-transform: uppercase; }
  .summary-card .value { color: #e2e6ed; font-size: 1.4rem; font-weight: 700; margin-top: 2px; }
</style>
</head>
<body>
  <h1>Performance Flamechart</h1>
  <p class="subtitle">Generated ${new Date().toISOString()} — ${demos.length} demo(s)</p>

  <div class="summary">
    <div class="summary-card">
      <div class="label">Demos</div>
      <div class="value">${demos.length}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total capture time</div>
      <div class="value">${fmtMs(demos.reduce((s, d) => s + d.captureSpanMs, 0))}</div>
    </div>
    <div class="summary-card">
      <div class="label">Bottleneck demos</div>
      <div class="value">${demos.filter((d) => d.bottlenecks.length > 0).length}</div>
    </div>
    <div class="summary-card">
      <div class="label">Avg actions/demo</div>
      <div class="value">${Math.round(demos.reduce((s, d) => s + d.actionCount, 0) / demos.length)}</div>
    </div>
  </div>

  <div class="legend">
    <div class="legend-item"><div class="legend-swatch" style="background:#3b82f6"></div>Navigation</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#22c55e"></div>Actions</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#f59e0b"></div>Waits</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#6366f1"></div>Overhead</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Demo</th>
        <th style="text-align:right">Duration</th>
        <th>Phase breakdown</th>
        <th style="text-align:center">Actions</th>
        <th style="text-align:right">MP4 size</th>
        <th>Bottleneck</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <h2>Detailed breakdown</h2>
  <table>
    <thead>
      <tr>
        <th>Demo</th>
        <th style="text-align:right">Navigation</th>
        <th style="text-align:right">Actions</th>
        <th style="text-align:right">Waits</th>
        <th style="text-align:right">Overhead</th>
        <th style="text-align:right">Total</th>
        <th style="text-align:right">MP4</th>
        <th style="text-align:right">WebM</th>
        <th style="text-align:right">Trace</th>
      </tr>
    </thead>
    <tbody>
      ${detailRows}
    </tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    usage();
    process.exit(0);
  }

  if (!(await exists(opts.outputDir))) {
    console.error(`Output directory not found: ${opts.outputDir}`);
    console.error("Run a capture suite first: node scripts/examples-suite.mjs --mode capture");
    process.exit(1);
  }

  const entries = await readdir(opts.outputDir, { withFileTypes: true });
  let demoDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  if (opts.filter) {
    const f = opts.filter.toLowerCase();
    demoDirs = demoDirs.filter((name) => name.toLowerCase().includes(f));
  }

  if (demoDirs.length === 0) {
    console.error("No demo directories found.");
    process.exit(1);
  }

  console.log(`Analysing ${demoDirs.length} demo(s) in ${opts.outputDir}\n`);

  const demos = [];
  for (const slug of demoDirs) {
    const demoDir = path.join(opts.outputDir, slug);
    const result = await analyseDemo(demoDir, slug);
    if (result) {
      demos.push(result);
      const flag = result.bottlenecks.length > 0 ? ` [!] ${result.bottlenecks.join(", ")}` : "";
      console.log(
        `  ${slug.padEnd(32)} ${fmtMs(result.captureSpanMs).padStart(8)}  (${result.actionCount} actions)${flag}`,
      );
    }
  }

  if (demos.length === 0) {
    console.error("\nNo demos with valid metadata/events found.");
    process.exit(1);
  }

  // Sort by total duration descending
  demos.sort((a, b) => b.captureSpanMs - a.captureSpanMs);

  // Write JSON report
  const reportDir = path.join(root, "output");
  await mkdir(reportDir, { recursive: true });

  const jsonPath = path.join(reportDir, "perf-report.json");
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        demoCount: demos.length,
        totalCaptureMs: demos.reduce((s, d) => s + d.captureSpanMs, 0),
        demos,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  // Write HTML report
  const htmlPath = path.join(reportDir, "perf-report.html");
  await writeFile(htmlPath, generateHTML(demos), "utf8");

  console.log(`\nReports written:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  HTML: ${htmlPath}`);
  console.log(`\nOpen in browser: file://${htmlPath.replace(/\\/g, "/")}`);
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
