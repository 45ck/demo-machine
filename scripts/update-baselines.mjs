#!/usr/bin/env node
/**
 * update-baselines.mjs — Regenerate baseline files from current captures.
 *
 * Usage:
 *   node scripts/update-baselines.mjs --type events [--capture-dir <dir>]
 *   node scripts/update-baselines.mjs --type perf   [--capture-dir <dir>]
 *   node scripts/update-baselines.mjs --type all    [--capture-dir <dir>]
 *   node scripts/update-baselines.mjs --help
 *
 * --capture-dir defaults to output/example-suite.
 *
 * For events baselines: copies the events.json from each capture output into
 *   baselines/events/{slug}.json
 *
 * For perf baselines: reads metadata.json from each capture output and writes
 *   baselines/perf/{slug}.json with { captureMs, renderMs, totalMs }
 */
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const opts = { type: null, captureDir: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--type") {
      opts.type = argv[++i] ?? null;
    } else if (a === "--capture-dir") {
      opts.captureDir = argv[++i] ?? null;
    } else if (a === "-h" || a === "--help") {
      opts.help = true;
    }
  }
  return opts;
}

function usage() {
  console.log(
    [
      "update-baselines — Regenerate baseline files from captures",
      "",
      "Usage:",
      "  node scripts/update-baselines.mjs --type <events|perf|all> [--capture-dir <dir>]",
      "",
      "Options:",
      "  --type <type>          Baseline type: events, perf, or all",
      "  --capture-dir <dir>    Capture output root (default: output/example-suite)",
      "  -h, --help             Show this help message",
    ].join("\n"),
  );
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function updateEventsBaselines(captureRoot, baselinesDir) {
  const eventsDir = path.join(baselinesDir, "events");
  await mkdir(eventsDir, { recursive: true });

  const entries = await readdir(captureRoot, { withFileTypes: true });
  const slugDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  let updated = 0;
  let skipped = 0;

  for (const slug of slugDirs) {
    const eventsPath = path.join(captureRoot, slug, "events.json");
    if (!(await fileExists(eventsPath))) {
      console.log(`  skip: ${slug} (no events.json)`);
      skipped++;
      continue;
    }

    const events = await readFile(eventsPath, "utf8");
    // Validate it is a JSON array before writing
    let parsed;
    try {
      parsed = JSON.parse(events);
    } catch {
      console.log(`  skip: ${slug} (invalid JSON)`);
      skipped++;
      continue;
    }
    if (!Array.isArray(parsed)) {
      console.log(`  skip: ${slug} (events.json is not an array)`);
      skipped++;
      continue;
    }

    const outPath = path.join(eventsDir, `${slug}.json`);
    await writeFile(outPath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
    console.log(`  write: ${slug} (${parsed.length} events)`);
    updated++;
  }

  console.log(`Events baselines: ${updated} updated, ${skipped} skipped.`);
}

async function updatePerfBaselines(captureRoot, baselinesDir) {
  const perfDir = path.join(baselinesDir, "perf");
  await mkdir(perfDir, { recursive: true });

  const entries = await readdir(captureRoot, { withFileTypes: true });
  const slugDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  let updated = 0;
  let skipped = 0;

  for (const slug of slugDirs) {
    const metadataPath = path.join(captureRoot, slug, "metadata.json");
    if (!(await fileExists(metadataPath))) {
      console.log(`  skip: ${slug} (no metadata.json)`);
      skipped++;
      continue;
    }

    let metadata;
    try {
      metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    } catch {
      console.log(`  skip: ${slug} (invalid JSON)`);
      skipped++;
      continue;
    }

    // Extract timing fields; the metadata schema may vary, so be flexible
    const captureMs =
      typeof metadata.captureMs === "number"
        ? metadata.captureMs
        : (metadata.timing?.captureMs ?? 0);
    const renderMs =
      typeof metadata.renderMs === "number" ? metadata.renderMs : (metadata.timing?.renderMs ?? 0);
    const totalMs =
      typeof metadata.totalMs === "number"
        ? metadata.totalMs
        : (metadata.timing?.totalMs ?? captureMs + renderMs);

    const perf = { captureMs, renderMs, totalMs };
    const outPath = path.join(perfDir, `${slug}.json`);
    await writeFile(outPath, JSON.stringify(perf, null, 2) + "\n", "utf8");
    console.log(`  write: ${slug} (total: ${totalMs}ms)`);
    updated++;
  }

  console.log(`Perf baselines: ${updated} updated, ${skipped} skipped.`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    usage();
    process.exit(0);
  }

  const validTypes = new Set(["events", "perf", "all"]);
  if (!opts.type || !validTypes.has(opts.type)) {
    console.error("Error: --type must be one of: events, perf, all");
    console.error("Run with --help for usage information.");
    process.exit(2);
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, "..");
  const captureRoot = opts.captureDir
    ? path.resolve(opts.captureDir)
    : path.join(root, "output", "example-suite");
  const baselinesDir = path.join(root, "baselines");

  if (!(await fileExists(captureRoot))) {
    console.error(`Error: capture directory does not exist: ${captureRoot}`);
    process.exit(1);
  }

  console.log(`Capture root: ${captureRoot}`);
  console.log(`Baselines dir: ${baselinesDir}`);
  console.log("");

  if (opts.type === "events" || opts.type === "all") {
    console.log("Updating events baselines...");
    await updateEventsBaselines(captureRoot, baselinesDir);
    console.log("");
  }

  if (opts.type === "perf" || opts.type === "all") {
    console.log("Updating perf baselines...");
    await updatePerfBaselines(captureRoot, baselinesDir);
    console.log("");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
