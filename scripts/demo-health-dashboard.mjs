#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SUITE_DIR = path.join(ROOT, "output", "example-suite");
const DOCS_DIR = path.join(ROOT, "docs");

/** Safely read + parse a JSON file; returns undefined on any error. */
function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

/** Return file size in bytes, or 0 if the file is missing. */
function fileSizeBytes(filePath) {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

/** Collect per-demo metrics from a single output directory. */
function collectDemo(slug, dir) {
  const failurePath = path.join(dir, "failure.json");
  const hasFailed = existsSync(failurePath);

  const verification = readJson(path.join(dir, "verification.json"));
  const metadata = readJson(path.join(dir, "metadata.json"));
  const events = readJson(path.join(dir, "events.json"));
  const narrationSegments = readJson(path.join(dir, "narration-segments.json"));

  const mp4Path = path.join(dir, "output.mp4");
  const mp4Exists = existsSync(mp4Path);
  const mp4SizeBytes = fileSizeBytes(mp4Path);

  // Status
  let status = "missing";
  if (hasFailed) {
    status = "fail";
  } else if (verification?.status === "passed") {
    status = "pass";
  } else if (verification) {
    status = "fail";
  } else if (mp4Exists) {
    status = "warn";
  }

  // Duration: compute from events if available
  let durationSec = null;
  if (Array.isArray(events) && events.length > 0) {
    const first = events[0];
    const last = events[events.length - 1];
    const startTs = first.timestamp ?? 0;
    const endTs = (last.timestamp ?? 0) + (last.duration ?? 0);
    if (endTs > startTs) {
      durationSec = Number(((endTs - startTs) / 1000).toFixed(2));
    }
  }

  // Resolution from verification spec info (not directly stored, but we can
  // note it from metadata title or leave null)
  const resolution = null;

  // Action analysis
  let actionCount = 0;
  const actionTypes = {};
  if (Array.isArray(events)) {
    actionCount = events.length;
    for (const ev of events) {
      const a = ev.action ?? "unknown";
      actionTypes[a] = (actionTypes[a] ?? 0) + 1;
    }
  }

  // Narration coverage: segments with text vs total event count
  let narrationCoverage = null;
  let narrationSegmentCount = 0;
  let narrationOverlapCount = 0;
  if (Array.isArray(narrationSegments)) {
    narrationSegmentCount = narrationSegments.length;

    // Count overlapping segments (segment N+1 starts before segment N ends)
    for (let i = 0; i < narrationSegments.length - 1; i++) {
      const curr = narrationSegments[i];
      const next = narrationSegments[i + 1];
      const currEnd = (curr.startMs ?? 0) + (curr.durationMs ?? 0);
      if ((next.startMs ?? 0) < currEnd) {
        narrationOverlapCount++;
      }
    }

    // Events with narration text
    const eventsWithNarration = Array.isArray(events)
      ? events.filter((e) => typeof e.narration === "string" && e.narration.length > 0).length
      : 0;

    if (actionCount > 0) {
      narrationCoverage = Number(((eventsWithNarration / actionCount) * 100).toFixed(1));
    }
  }

  // Quality gate score from verification checks
  let qualityScore = null;
  let checksPassed = 0;
  let checksTotal = 0;
  if (verification?.checks && typeof verification.checks === "object") {
    for (const [, val] of Object.entries(verification.checks)) {
      checksTotal++;
      if (val === true) checksPassed++;
    }
    if (checksTotal > 0) {
      qualityScore = Number(((checksPassed / checksTotal) * 100).toFixed(1));
    }
  }

  // Timestamp
  const lastCaptureTimestamp = metadata?.createdAt ?? verification?.createdAt ?? null;

  // Spec path
  const specPath = verification?.spec?.path ?? null;
  const specTitle = verification?.spec?.title ?? metadata?.specTitle ?? slug;

  return {
    slug,
    title: specTitle,
    status,
    durationSec,
    resolution,
    actionCount,
    actionTypes,
    narrationCoverage,
    narrationSegmentCount,
    narrationOverlapCount,
    mp4Exists,
    mp4SizeMb: mp4SizeBytes > 0 ? Number((mp4SizeBytes / (1024 * 1024)).toFixed(2)) : null,
    lastCaptureTimestamp,
    specPath,
    qualityScore,
    checksPassed,
    checksTotal,
    chapterCount: verification?.spec?.chapterCount ?? null,
    stepCount: verification?.spec?.stepCount ?? null,
    eventCount: verification?.playback?.eventCount ?? null,
  };
}

/** Scan all demo output directories and collect metrics. */
function collectAll() {
  if (!existsSync(SUITE_DIR)) {
    console.error(`Suite directory not found: ${SUITE_DIR}`);
    process.exit(1);
  }

  const entries = readdirSync(SUITE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  return entries.map((slug) => collectDemo(slug, path.join(SUITE_DIR, slug)));
}

/** Generate the self-contained HTML dashboard string. */
function generateHtml(demos, generatedAt) {
  const total = demos.length;
  const passing = demos.filter((d) => d.status === "pass").length;
  const failing = demos.filter((d) => d.status === "fail").length;
  const warnings = demos.filter((d) => d.status === "warn").length;
  const missing = demos.filter((d) => d.status === "missing").length;

  const maxDuration = Math.max(...demos.map((d) => d.durationSec ?? 0), 1);
  const maxSize = Math.max(...demos.map((d) => d.mp4SizeMb ?? 0), 1);

  const demosJson = JSON.stringify(demos);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>demo-machine - Demo Health Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #0d0f14;
      color: #e2e8f0;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      padding: 24px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 12px;
    }

    .header h1 {
      font-size: 20px;
      font-weight: 700;
      color: #f1f5f9;
      letter-spacing: -0.02em;
    }

    .header-meta {
      font-size: 11px;
      color: #475569;
    }

    /* Summary bar */
    .summary {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .summary-card {
      background: #141720;
      border: 1px solid #1e2330;
      border-radius: 8px;
      padding: 14px 20px;
      min-width: 130px;
      flex: 1;
    }

    .summary-card .label {
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 4px;
    }

    .summary-card .value {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .summary-card .value.total   { color: #e2e8f0; }
    .summary-card .value.pass    { color: #4ade80; }
    .summary-card .value.fail    { color: #f87171; }
    .summary-card .value.warn    { color: #facc15; }
    .summary-card .value.missing { color: #64748b; }

    /* Controls */
    .controls {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .search-box {
      background: #141720;
      border: 1px solid #2d3448;
      border-radius: 6px;
      color: #e2e8f0;
      font-size: 13px;
      padding: 7px 12px;
      width: 260px;
      outline: none;
      transition: border-color 0.15s;
    }

    .search-box:focus {
      border-color: #2563eb;
    }

    .search-box::placeholder {
      color: #475569;
    }

    .filter-btn {
      background: #1e2330;
      border: 1px solid #2d3448;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 5px;
      cursor: pointer;
      transition: background 0.12s, color 0.12s, border-color 0.12s;
    }

    .filter-btn:hover,
    .filter-btn.active {
      background: #2563eb;
      border-color: #2563eb;
      color: #fff;
    }

    /* Table */
    .table-wrap {
      overflow-x: auto;
      border-radius: 8px;
      border: 1px solid #1e2330;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    thead th {
      background: #141720;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 10px 14px;
      text-align: left;
      border-bottom: 1px solid #1e2330;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      position: relative;
    }

    thead th:hover {
      color: #e2e8f0;
    }

    thead th .sort-arrow {
      margin-left: 4px;
      font-size: 10px;
      color: #475569;
    }

    thead th.sorted .sort-arrow {
      color: #2563eb;
    }

    tbody tr {
      border-bottom: 1px solid #1a1e2a;
      transition: background 0.1s;
    }

    tbody tr:hover {
      background: #141720;
    }

    tbody td {
      padding: 10px 14px;
      white-space: nowrap;
    }

    /* Status badge */
    .badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .badge-pass    { background: #14532d; color: #4ade80; }
    .badge-fail    { background: #450a0a; color: #f87171; }
    .badge-warn    { background: #422006; color: #facc15; }
    .badge-missing { background: #1e293b; color: #64748b; }

    /* Sparkline bar */
    .bar-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .bar-track {
      width: 80px;
      height: 6px;
      background: #1e2330;
      border-radius: 3px;
      overflow: hidden;
      flex-shrink: 0;
    }

    .bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s;
    }

    .bar-fill.duration { background: #3b82f6; }
    .bar-fill.size     { background: #8b5cf6; }

    .bar-value {
      font-size: 12px;
      color: #94a3b8;
      min-width: 50px;
    }

    /* Action type pills */
    .action-pills {
      display: flex;
      gap: 3px;
      flex-wrap: wrap;
    }

    .action-pill {
      font-size: 9px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 3px;
      background: #1e2330;
      color: #64748b;
    }

    /* Narration coverage mini-bar */
    .coverage-cell {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .coverage-track {
      width: 50px;
      height: 6px;
      background: #1e2330;
      border-radius: 3px;
      overflow: hidden;
    }

    .coverage-fill {
      height: 100%;
      border-radius: 3px;
      background: #22c55e;
    }

    .coverage-value {
      font-size: 12px;
      color: #94a3b8;
    }

    .muted { color: #475569; }

    .quality-score {
      font-weight: 600;
    }
    .quality-score.perfect { color: #4ade80; }
    .quality-score.good    { color: #facc15; }
    .quality-score.bad     { color: #f87171; }

    .timestamp {
      font-size: 11px;
      color: #64748b;
    }
  </style>
</head>
<body>

<div class="header">
  <h1>demo-machine - Demo Health Dashboard</h1>
  <span class="header-meta">Generated ${generatedAt}</span>
</div>

<div class="summary">
  <div class="summary-card">
    <div class="label">Total Demos</div>
    <div class="value total">${total}</div>
  </div>
  <div class="summary-card">
    <div class="label">Passing</div>
    <div class="value pass">${passing}</div>
  </div>
  <div class="summary-card">
    <div class="label">Failing</div>
    <div class="value fail">${failing}</div>
  </div>
  <div class="summary-card">
    <div class="label">Warnings</div>
    <div class="value warn">${warnings}</div>
  </div>
  <div class="summary-card">
    <div class="label">Missing</div>
    <div class="value missing">${missing}</div>
  </div>
</div>

<div class="controls">
  <input type="text" class="search-box" id="searchBox" placeholder="Filter demos..." />
  <button class="filter-btn active" data-filter="all">All</button>
  <button class="filter-btn" data-filter="pass">Pass</button>
  <button class="filter-btn" data-filter="fail">Fail</button>
  <button class="filter-btn" data-filter="warn">Warn</button>
  <button class="filter-btn" data-filter="missing">Missing</button>
</div>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th data-col="slug">Demo <span class="sort-arrow"></span></th>
        <th data-col="status">Status <span class="sort-arrow"></span></th>
        <th data-col="durationSec">Duration <span class="sort-arrow"></span></th>
        <th data-col="actionCount">Actions <span class="sort-arrow"></span></th>
        <th data-col="actionTypes">Action Types</th>
        <th data-col="narrationCoverage">Narration <span class="sort-arrow"></span></th>
        <th data-col="mp4SizeMb">File Size <span class="sort-arrow"></span></th>
        <th data-col="qualityScore">Quality <span class="sort-arrow"></span></th>
        <th data-col="lastCaptureTimestamp">Last Capture <span class="sort-arrow"></span></th>
      </tr>
    </thead>
    <tbody id="tableBody"></tbody>
  </table>
</div>

<script>
const demos = ${demosJson};
const maxDuration = ${maxDuration};
const maxSize = ${maxSize};

let currentFilter = "all";
let currentSearch = "";
let sortCol = "slug";
let sortAsc = true;

function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function statusBadge(s) {
  return '<span class="badge badge-' + s + '">' + s + '</span>';
}

function barHtml(value, max, cls) {
  if (value == null) return '<span class="muted">--</span>';
  const pct = Math.min(100, (value / max) * 100).toFixed(1);
  return '<div class="bar-cell">' +
    '<div class="bar-track"><div class="bar-fill ' + cls + '" style="width:' + pct + '%"></div></div>' +
    '<span class="bar-value">' + value + (cls === "duration" ? "s" : " MB") + '</span>' +
    '</div>';
}

function actionPillsHtml(types) {
  if (!types || Object.keys(types).length === 0) return '<span class="muted">--</span>';
  return '<div class="action-pills">' +
    Object.entries(types)
      .sort((a, b) => b[1] - a[1])
      .map(function(e) { return '<span class="action-pill">' + escapeHtml(e[0]) + ':' + e[1] + '</span>'; })
      .join("") +
    '</div>';
}

function coverageHtml(pct) {
  if (pct == null) return '<span class="muted">--</span>';
  return '<div class="coverage-cell">' +
    '<div class="coverage-track"><div class="coverage-fill" style="width:' + Math.min(100, pct) + '%"></div></div>' +
    '<span class="coverage-value">' + pct + '%</span>' +
    '</div>';
}

function qualityHtml(score) {
  if (score == null) return '<span class="muted">--</span>';
  var cls = score >= 100 ? "perfect" : score >= 70 ? "good" : "bad";
  return '<span class="quality-score ' + cls + '">' + score + '%</span>';
}

function timestampHtml(ts) {
  if (!ts) return '<span class="muted">--</span>';
  try {
    var d = new Date(ts);
    return '<span class="timestamp">' + d.toLocaleString() + '</span>';
  } catch(e) {
    return '<span class="timestamp">' + escapeHtml(ts) + '</span>';
  }
}

function sortValue(demo, col) {
  switch (col) {
    case "slug": return demo.slug.toLowerCase();
    case "status": return ["pass","warn","fail","missing"].indexOf(demo.status);
    case "durationSec": return demo.durationSec ?? -1;
    case "actionCount": return demo.actionCount ?? -1;
    case "narrationCoverage": return demo.narrationCoverage ?? -1;
    case "mp4SizeMb": return demo.mp4SizeMb ?? -1;
    case "qualityScore": return demo.qualityScore ?? -1;
    case "lastCaptureTimestamp": return demo.lastCaptureTimestamp ?? "";
    default: return "";
  }
}

function render() {
  var filtered = demos.filter(function(d) {
    if (currentFilter !== "all" && d.status !== currentFilter) return false;
    if (currentSearch && d.slug.toLowerCase().indexOf(currentSearch) === -1 &&
        (d.title || "").toLowerCase().indexOf(currentSearch) === -1) return false;
    return true;
  });

  filtered.sort(function(a, b) {
    var va = sortValue(a, sortCol);
    var vb = sortValue(b, sortCol);
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  var html = "";
  for (var i = 0; i < filtered.length; i++) {
    var d = filtered[i];
    html += "<tr>" +
      "<td><strong>" + escapeHtml(d.slug) + "</strong></td>" +
      "<td>" + statusBadge(d.status) + "</td>" +
      "<td>" + barHtml(d.durationSec, maxDuration, "duration") + "</td>" +
      "<td>" + (d.actionCount || '<span class="muted">--</span>') + "</td>" +
      "<td>" + actionPillsHtml(d.actionTypes) + "</td>" +
      "<td>" + coverageHtml(d.narrationCoverage) + "</td>" +
      "<td>" + barHtml(d.mp4SizeMb, maxSize, "size") + "</td>" +
      "<td>" + qualityHtml(d.qualityScore) + "</td>" +
      "<td>" + timestampHtml(d.lastCaptureTimestamp) + "</td>" +
      "</tr>";
  }

  document.getElementById("tableBody").innerHTML = html;

  // Update sort arrows
  document.querySelectorAll("thead th").forEach(function(th) {
    var arrow = th.querySelector(".sort-arrow");
    if (!arrow) return;
    th.classList.remove("sorted");
    arrow.textContent = "";
    if (th.dataset.col === sortCol) {
      th.classList.add("sorted");
      arrow.textContent = sortAsc ? " \\u25B2" : " \\u25BC";
    }
  });
}

// Sort on header click
document.querySelectorAll("thead th[data-col]").forEach(function(th) {
  th.addEventListener("click", function() {
    var col = th.dataset.col;
    if (col === "actionTypes") return; // not sortable
    if (sortCol === col) {
      sortAsc = !sortAsc;
    } else {
      sortCol = col;
      sortAsc = true;
    }
    render();
  });
});

// Filter buttons
document.querySelectorAll(".filter-btn").forEach(function(btn) {
  btn.addEventListener("click", function() {
    document.querySelectorAll(".filter-btn").forEach(function(b) { b.classList.remove("active"); });
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    render();
  });
});

// Search
document.getElementById("searchBox").addEventListener("input", function(e) {
  currentSearch = e.target.value.toLowerCase().trim();
  render();
});

render();
</script>
</body>
</html>`;
}

async function main() {
  console.log("Scanning demo outputs...");
  const demos = collectAll();
  console.log(`Found ${demos.length} demo(s).`);

  const generatedAt = new Date().toISOString();

  // Ensure docs directory exists
  await mkdir(DOCS_DIR, { recursive: true });

  // Write JSON metrics
  const jsonPath = path.join(DOCS_DIR, "demo-health.json");
  const jsonPayload = {
    generatedAt,
    summary: {
      total: demos.length,
      passing: demos.filter((d) => d.status === "pass").length,
      failing: demos.filter((d) => d.status === "fail").length,
      warnings: demos.filter((d) => d.status === "warn").length,
      missing: demos.filter((d) => d.status === "missing").length,
    },
    demos,
  };
  await writeFile(jsonPath, JSON.stringify(jsonPayload, null, 2) + "\n");
  console.log(`Wrote ${jsonPath}`);

  // Write HTML dashboard
  const htmlPath = path.join(DOCS_DIR, "demo-health.html");
  await writeFile(htmlPath, generateHtml(demos, generatedAt));
  console.log(`Wrote ${htmlPath}`);

  // Print summary
  const { summary } = jsonPayload;
  console.log(
    `\nSummary: ${summary.total} total | ` +
      `${summary.passing} pass | ${summary.failing} fail | ` +
      `${summary.warnings} warn | ${summary.missing} missing`,
  );
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
