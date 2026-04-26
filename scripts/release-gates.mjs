#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_CHECKS = ["tools", "gallery", "package"];

class GateError extends Error {}

function parseArgs(argv) {
  const opts = {
    checks: DEFAULT_CHECKS,
    root: process.cwd(),
    packageDryRun: true,
    launchChromium: false,
    strictGallerySpecs: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--checks") {
      opts.checks = String(argv[++i] ?? "")
        .split(",")
        .map((check) => check.trim())
        .filter(Boolean);
    } else if (arg === "--check") {
      opts.checks = [argv[++i]].filter(Boolean);
    } else if (arg === "--root") {
      opts.root = argv[++i] ?? opts.root;
    } else if (arg === "--skip-tools") {
      opts.checks = opts.checks.filter((check) => check !== "tools");
    } else if (arg === "--skip-gallery") {
      opts.checks = opts.checks.filter((check) => check !== "gallery");
    } else if (arg === "--skip-package") {
      opts.checks = opts.checks.filter((check) => check !== "package");
    } else if (arg === "--no-package-dry-run") {
      opts.packageDryRun = false;
    } else if (arg === "--launch-chromium") {
      opts.launchChromium = true;
    } else if (arg === "--strict-gallery-specs") {
      opts.strictGallerySpecs = true;
    } else if (arg === "-h" || arg === "--help") {
      opts.help = true;
    }
  }

  return opts;
}

function usage() {
  console.log(
    [
      "release-gates",
      "",
      "Usage:",
      "  node scripts/release-gates.mjs [--checks tools,gallery,package] [--no-package-dry-run] [--launch-chromium] [--strict-gallery-specs]",
      "",
      "Checks:",
      "  tools    ffmpeg, ffprobe, and Playwright Chromium executable availability",
      "  gallery  examples/manifest.json gallery-reviewed suites have gallery assets",
      "  package  package entrypoints exist and `pnpm pack --dry-run` succeeds",
    ].join("\n"),
  );
}

function commandForPlatform(command) {
  if (process.platform !== "win32") return command;
  if (command === "pnpm") return "pnpm.cmd";
  if (command === "node") return "node.exe";
  return command;
}

function runCapture(command, args, cwd) {
  if (process.platform === "win32" && command === "pnpm") {
    return spawnSync(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", [command, ...args].join(" ")],
      {
        cwd,
        encoding: "utf8",
        windowsHide: true,
      },
    );
  }

  return spawnSync(commandForPlatform(command), args, {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function normalizeRel(root, filePath) {
  return path.relative(root, path.resolve(root, filePath)).replaceAll("\\", "/");
}

function pass(message, details = {}) {
  return { status: "pass", message, ...details };
}

function warn(message, details = {}) {
  return { status: "warn", message, ...details };
}

function fail(message, details = {}) {
  return { status: "fail", message, ...details };
}

async function checkBinary(command, args, label, root) {
  const result = runCapture(command, args, root);
  if (result.error) {
    return fail(`${label} is not available: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    return fail(`${label} failed availability check${detail ? `: ${detail}` : ""}`);
  }
  const firstLine =
    String(result.stdout || result.stderr)
      .split(/\r?\n/)
      .find(Boolean) ?? "ok";
  return pass(`${label} available`, { detail: firstLine.slice(0, 160) });
}

export async function checkExternalTools({ root = process.cwd(), launchChromium = false } = {}) {
  const results = [
    await checkBinary("ffmpeg", ["-version"], "ffmpeg", root),
    await checkBinary("ffprobe", ["-version"], "ffprobe", root),
  ];

  try {
    const { chromium } = await import("playwright");
    const executablePath = chromium.executablePath();
    if (!(await exists(executablePath))) {
      results.push(
        fail(
          `Playwright Chromium executable is missing at ${executablePath}. Run: pnpm exec playwright install chromium`,
        ),
      );
    } else if (launchChromium) {
      const browser = await chromium.launch({ headless: true });
      await browser.close();
      results.push(pass("Playwright Chromium launches", { detail: executablePath }));
    } else {
      results.push(pass("Playwright Chromium executable available", { detail: executablePath }));
    }
  } catch (err) {
    results.push(
      fail(
        `Playwright Chromium availability check failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );
  }

  return results;
}

function isGalleryReviewedSuite(suite) {
  return (
    suite?.visualBaseline === "gallery" ||
    (Array.isArray(suite?.qualitySignals) && suite.qualitySignals.includes("gallery-reviewed"))
  );
}

export async function checkGalleryConsistency({
  root = process.cwd(),
  strictSpecPaths = false,
} = {}) {
  const results = [];
  const examplesManifestPath = path.join(root, "examples", "manifest.json");
  const galleryManifestPath = path.join(root, "assets", "demo-gallery", "manifest.json");
  const examplesManifest = await readJson(examplesManifestPath);
  const galleryManifest = await readJson(galleryManifestPath);
  const galleryResults = new Map(
    (galleryManifest.results ?? []).map((entry) => [String(entry.slug), entry]),
  );
  const reviewedSuites = (examplesManifest.suites ?? []).filter(isGalleryReviewedSuite);

  if (reviewedSuites.length === 0) {
    return [warn("No gallery-reviewed suites found in examples/manifest.json")];
  }

  for (const suite of reviewedSuites) {
    const entry = galleryResults.get(suite.slug);
    if (!entry) {
      results.push(fail(`Gallery-reviewed suite is missing gallery manifest entry: ${suite.slug}`));
      continue;
    }

    if (entry.spec && normalizeRel(root, entry.spec) !== normalizeRel(root, suite.canonicalSpec)) {
      const message = `Gallery manifest spec for ${suite.slug} points to ${entry.spec}; expected ${suite.canonicalSpec}`;
      results.push(strictSpecPaths ? fail(message) : warn(message));
    }

    const assets = [entry.gif, ...(Array.isArray(entry.frames) ? entry.frames : [])].filter(
      Boolean,
    );
    if (!entry.gif) {
      results.push(fail(`Gallery entry is missing GIF path: ${suite.slug}`));
    }
    if (!Array.isArray(entry.frames) || entry.frames.length < 5) {
      results.push(fail(`Gallery entry should list at least 5 frames: ${suite.slug}`));
    }

    for (const asset of assets) {
      const assetPath = path.resolve(root, asset);
      if (!(await exists(assetPath))) {
        results.push(fail(`Gallery asset is missing for ${suite.slug}: ${asset}`));
        continue;
      }
      const assetStat = await stat(assetPath);
      if (assetStat.size <= 0) {
        results.push(fail(`Gallery asset is empty for ${suite.slug}: ${asset}`));
      }
    }
  }

  const failures = results.filter((result) => result.status === "fail").length;
  const warnings = results.filter((result) => result.status === "warn").length;
  results.push(
    pass(
      `Gallery consistency checked ${String(reviewedSuites.length)} reviewed suites (${String(
        failures,
      )} failures, ${String(warnings)} warnings)`,
    ),
  );
  return results;
}

export async function checkPackageReadiness({ root = process.cwd(), dryRun = true } = {}) {
  const results = [];
  const packageJsonPath = path.join(root, "package.json");
  const pkg = await readJson(packageJsonPath);
  const entrypoints = [pkg.main, pkg.types, ...Object.values(pkg.bin ?? {})].filter(Boolean);

  for (const entrypoint of entrypoints) {
    const entryPath = path.resolve(root, entrypoint);
    if (await exists(entryPath)) {
      results.push(pass(`Package entrypoint exists: ${entrypoint}`));
    } else {
      results.push(fail(`Package entrypoint is missing: ${entrypoint}`));
    }
  }

  if (dryRun) {
    const result = runCapture("pnpm", ["pack", "--dry-run"], root);
    if (result.error) {
      results.push(fail(`pnpm pack --dry-run could not start: ${result.error.message}`));
    } else if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || "").trim();
      results.push(fail(`pnpm pack --dry-run failed${detail ? `: ${detail}` : ""}`));
    } else {
      results.push(pass("pnpm pack --dry-run succeeded"));
    }
  } else {
    results.push(warn("Skipped pnpm pack --dry-run"));
  }

  return results;
}

function printResults(results) {
  for (const result of results) {
    const tag =
      result.status === "pass" ? "[pass]" : result.status === "warn" ? "[warn]" : "[fail]";
    console.log(`${tag} ${result.message}`);
    if (result.detail) console.log(`       ${result.detail}`);
  }
}

async function runChecks(opts) {
  const root = path.resolve(opts.root);
  const unknown = opts.checks.filter((check) => !DEFAULT_CHECKS.includes(check));
  if (unknown.length > 0) {
    throw new GateError(`Unknown release gate checks: ${unknown.join(", ")}`);
  }

  const results = [];
  if (opts.checks.includes("tools")) {
    results.push(...(await checkExternalTools({ root, launchChromium: opts.launchChromium })));
  }
  if (opts.checks.includes("gallery")) {
    results.push(
      ...(await checkGalleryConsistency({
        root,
        strictSpecPaths: opts.strictGallerySpecs,
      })),
    );
  }
  if (opts.checks.includes("package")) {
    results.push(...(await checkPackageReadiness({ root, dryRun: opts.packageDryRun })));
  }
  return results;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }

  const results = await runChecks(opts);
  printResults(results);
  process.exitCode = results.some((result) => result.status === "fail") ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(err instanceof GateError ? 2 : 1);
  });
}
