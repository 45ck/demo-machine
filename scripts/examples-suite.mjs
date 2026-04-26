#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

function parseArgs(argv) {
  const opts = {
    mode: "validate", // validate | capture | run
    filter: null,
    releaseTier: null,
    suiteType: null,
    limit: null,
    canonicalOnly: false,
    headed: false,
    build: true,
    failFast: true,
    outputDir: "output/example-suite",
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
    if (a === "--release-tier" || a === "--tier") {
      opts.releaseTier = argv[++i] ?? opts.releaseTier;
      continue;
    }
    if (a === "--suite-type" || a === "--type") {
      opts.suiteType = argv[++i] ?? opts.suiteType;
      continue;
    }
    if (a === "--limit") {
      const raw = argv[++i];
      opts.limit = raw ? Number(raw) : opts.limit;
      continue;
    }
    if (a === "--canonical-only") {
      opts.canonicalOnly = true;
      continue;
    }
    if (a === "--headed") {
      opts.headed = true;
      continue;
    }
    if (a === "--output-dir") {
      opts.outputDir = argv[++i] ?? opts.outputDir;
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
      shell: process.platform === "win32" && cmd === "pnpm",
    });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      console.error(`Failed to spawn ${cmd}: ${error.message}`);
      resolve(1);
    });
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
      "  node scripts/examples-suite.mjs [--mode validate|capture|run] [--filter <substring>] [--release-tier <tier>] [--suite-type <type>] [--canonical-only] [--limit <n>] [--output-dir <dir>] [--headed] [--no-build] [--no-fail-fast]",
      "",
      "Examples:",
      "  node scripts/examples-suite.mjs --mode validate",
      "  node scripts/examples-suite.mjs --mode capture --filter spa-router",
      "  node scripts/examples-suite.mjs --mode run --release-tier pr --suite-type showcase --canonical-only --limit 2",
    ].join("\n"),
  );
}

async function verifyCaptureArtifacts(outDir) {
  const required = [
    "video.webm",
    "events.json",
    "metadata.json",
    "environment.json",
    "verification.json",
    "trace.zip",
  ];

  for (const file of required) {
    try {
      await access(path.join(outDir, file));
    } catch {
      throw new Error(`Missing required capture artifact: ${path.join(outDir, file)}`);
    }
  }

  const verification = JSON.parse(await readFile(path.join(outDir, "verification.json"), "utf8"));
  if (verification?.status !== "passed") {
    throw new Error(`verification.json did not record a passed capture for ${outDir}`);
  }
  if (verification?.checks?.requiredArtifactsPresent !== true) {
    throw new Error(`verification.json did not confirm required artifacts for ${outDir}`);
  }
}

async function verifyRunArtifacts(outDir) {
  await verifyCaptureArtifacts(outDir);
  try {
    await access(path.join(outDir, "output.mp4"));
  } catch {
    throw new Error(`Missing required rendered artifact: ${path.join(outDir, "output.mp4")}`);
  }
}

function slugLikeName(value) {
  return value
    .toLowerCase()
    .replace(/\.demo\.ya?ml$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function variantOutputName(spec) {
  return slugLikeName(path.basename(spec));
}

export function buildExampleSuiteSpecs(manifest, root) {
  return (manifest.suites ?? [])
    .flatMap((suite) => {
      const suiteMeta = {
        suiteSlug: suite.slug,
        releaseTier: suite.releaseTier ?? "",
        suiteType: suite.suiteType ?? "showcase",
        visualBaseline: suite.visualBaseline ?? "",
      };
      const canonicalSpec = suite.canonicalSpec
        ? [
            {
              spec: path.resolve(root, suite.canonicalSpec),
              outputName: slugLikeName(suite.slug),
              kind: "canonical",
              ...suiteMeta,
            },
          ]
        : [];
      const variantSpecs = (suite.variantSpecs ?? []).filter(Boolean).map((spec) => ({
        spec: path.resolve(root, spec),
        outputName: variantOutputName(spec),
        kind: "variant",
        ...suiteMeta,
      }));
      return [...canonicalSpec, ...variantSpecs];
    })
    .filter((entry) => entry.outputName.length > 0)
    .sort((a, b) => a.spec.localeCompare(b.spec));
}

export function filterExampleSuiteSpecs(entries, filters) {
  const normalizedFilters =
    typeof filters === "string" || filters == null ? { filter: filters } : filters;
  const substring = normalizedFilters.filter?.toLowerCase() ?? null;
  const releaseTier = normalizedFilters.releaseTier?.toLowerCase() ?? null;
  const suiteType = normalizedFilters.suiteType?.toLowerCase() ?? null;

  return entries.filter((entry) => {
    if (normalizedFilters.canonicalOnly && entry.kind !== "canonical") return false;
    if (releaseTier && entry.releaseTier.toLowerCase() !== releaseTier) return false;
    if (suiteType && entry.suiteType.toLowerCase() !== suiteType) return false;
    if (!substring) return true;
    const haystack = [
      entry.spec,
      entry.outputName,
      entry.suiteSlug,
      entry.releaseTier,
      entry.suiteType,
      entry.visualBaseline,
    ]
      .join(" ")
      .replaceAll("\\", "/");
    return haystack.toLowerCase().includes(substring);
  });
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
  const manifest = JSON.parse(await readFile(path.join(root, "examples", "manifest.json"), "utf8"));
  let specs = filterExampleSuiteSpecs(buildExampleSuiteSpecs(manifest, root), opts);
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

  const outRoot = path.resolve(root, opts.outputDir);
  await mkdir(outRoot, { recursive: true });

  let failures = 0;
  for (const { spec, outputName } of specs) {
    const outDir = path.join(outRoot, outputName);

    const args = ["dist/cli.js", opts.mode, spec];
    if (opts.mode !== "validate") {
      // Keep suite runs deterministic by disabling narration; `run` still renders output.mp4.
      args.push("--output", outDir, "--overwrite", "--no-narration");
      if (opts.headed) args.push("--no-headless");
    }

    const code = await run("node", args, { cwd: root });
    if (code !== 0) {
      failures++;
      if (opts.failFast) process.exit(code);
      continue;
    }

    if (opts.mode !== "validate") {
      try {
        if (opts.mode === "run") {
          await verifyRunArtifacts(outDir);
        } else {
          await verifyCaptureArtifacts(outDir);
        }
      } catch (err) {
        console.error(err?.stack ?? String(err));
        failures++;
        if (opts.failFast) process.exit(1);
      }
    }
  }

  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err?.stack ?? String(err));
    process.exit(1);
  });
}
