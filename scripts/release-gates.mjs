#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_CHECKS = ["tools", "gallery", "showcase", "package"];
const MAIN_SHOWCASE = {
  slug: "assurance-long-demo",
  spec: "examples/assurance/long-demo/long-demo.demo.yaml",
  mp4: "assets/demo-gallery/assurance-long-demo.mp4",
  poster: "assets/demo-gallery/assurance-long-demo-poster.webp",
  minMp4Bytes: 1_000_000,
  minPosterBytes: 10_000,
  minGalleryEntries: 10,
};

class GateError extends Error {}

function parseArgs(argv) {
  const opts = {
    checks: DEFAULT_CHECKS,
    root: process.cwd(),
    packageDryRun: true,
    packageSmoke: true,
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
    } else if (arg === "--no-package-smoke") {
      opts.packageSmoke = false;
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
      "  node scripts/release-gates.mjs [--checks tools,gallery,showcase,package] [--no-package-dry-run] [--no-package-smoke] [--launch-chromium] [--strict-gallery-specs]",
      "",
      "Checks:",
      "  tools    ffmpeg, ffprobe, and Playwright Chromium executable availability",
      "  gallery  examples/manifest.json gallery-reviewed suites have gallery assets",
      "  showcase README main showcase MP4/poster links and minimum curated gallery breadth",
      "  package  package entrypoints exist, `pnpm pack --dry-run` succeeds, and the tarball installs cleanly",
    ].join("\n"),
  );
}

function commandForPlatform(command) {
  if (process.platform !== "win32") return command;
  if (command === "node") return "node.exe";
  return command;
}

function quoteCmdArg(value) {
  const text = String(value);
  if (text.length === 0) return '""';
  if (!/[\s"&()<>^|]/.test(text)) return text;
  return `"${text.replaceAll("^", "^^").replaceAll('"', '""')}"`;
}

function runCapture(command, args, cwd) {
  if (process.platform === "win32" && (command === "pnpm" || command === "npm")) {
    return spawnSync(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", [command, ...args].map(quoteCmdArg).join(" ")],
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

export async function checkShowcaseAssets({
  root = process.cwd(),
  mainShowcase = MAIN_SHOWCASE,
} = {}) {
  const results = [];
  const readmePath = path.join(root, "README.md");
  const examplesManifestPath = path.join(root, "examples", "manifest.json");
  const galleryManifestPath = path.join(root, "assets", "demo-gallery", "manifest.json");
  const readme = await readFile(readmePath, "utf8");
  const examplesManifest = await readJson(examplesManifestPath);
  const galleryManifest = await readJson(galleryManifestPath);

  for (const linkedPath of [mainShowcase.spec, mainShowcase.mp4, mainShowcase.poster]) {
    if (readme.includes(linkedPath)) {
      results.push(pass(`README links main showcase asset: ${linkedPath}`));
    } else {
      results.push(fail(`README is missing main showcase link: ${linkedPath}`));
    }
  }

  const suite = (examplesManifest.suites ?? []).find((entry) => entry.slug === mainShowcase.slug);
  if (!suite) {
    results.push(
      fail(`Main showcase suite is missing from examples/manifest.json: ${mainShowcase.slug}`),
    );
  } else if (normalizeRel(root, suite.canonicalSpec) !== normalizeRel(root, mainShowcase.spec)) {
    results.push(
      fail(`Main showcase suite points to ${suite.canonicalSpec}; expected ${mainShowcase.spec}`),
    );
  } else {
    results.push(pass(`Main showcase suite is manifest-backed: ${mainShowcase.slug}`));
  }

  const requiredSignals = ["narration-sync", "cursor-overlays", "selector-intent"];
  const missingSignals = requiredSignals.filter(
    (signal) => !Array.isArray(suite?.qualitySignals) || !suite.qualitySignals.includes(signal),
  );
  if (missingSignals.length > 0) {
    results.push(
      fail(`Main showcase suite is missing quality signals: ${missingSignals.join(", ")}`),
    );
  } else {
    results.push(
      pass("Main showcase suite declares narration, cursor, and selector quality signals"),
    );
  }

  for (const asset of [
    { path: mainShowcase.mp4, minBytes: mainShowcase.minMp4Bytes, label: "main showcase MP4" },
    {
      path: mainShowcase.poster,
      minBytes: mainShowcase.minPosterBytes,
      label: "main showcase poster",
    },
  ]) {
    const assetPath = path.resolve(root, asset.path);
    if (!(await exists(assetPath))) {
      results.push(fail(`${asset.label} is missing: ${asset.path}`));
      continue;
    }
    const assetStat = await stat(assetPath);
    if (assetStat.size < asset.minBytes) {
      results.push(
        fail(
          `${asset.label} is too small: ${asset.path} (${String(assetStat.size)} bytes, expected at least ${String(asset.minBytes)})`,
        ),
      );
    } else {
      results.push(pass(`${asset.label} exists: ${asset.path}`));
    }
  }

  const galleryEntries = Array.isArray(galleryManifest.results) ? galleryManifest.results : [];
  const highQualityEntries = galleryEntries.filter(
    (entry) =>
      entry.gif &&
      Array.isArray(entry.frames) &&
      entry.frames.length >= 5 &&
      Number(entry.durationSec) > 0,
  );
  if (highQualityEntries.length < mainShowcase.minGalleryEntries) {
    results.push(
      fail(
        `Curated gallery has only ${String(highQualityEntries.length)} high-quality entries; expected at least ${String(mainShowcase.minGalleryEntries)}`,
      ),
    );
  } else {
    results.push(
      pass(
        `Curated gallery has ${String(highQualityEntries.length)} high-quality entries with GIFs, frames, and durations`,
      ),
    );
  }

  return results;
}

function commandDetail(command, args, result) {
  const output = (result.stderr || result.stdout || "").trim();
  return `${command} ${args.join(" ")} failed${output ? `: ${output}` : ""}`;
}

function packagePathParts(packageName) {
  return packageName.split("/").filter(Boolean);
}

async function installedBinExists(installDir, binName) {
  const binDir = path.join(installDir, "node_modules", ".bin");
  const candidates =
    process.platform === "win32" ? [`${binName}.cmd`, `${binName}.ps1`, binName] : [binName];

  for (const candidate of candidates) {
    if (await exists(path.join(binDir, candidate))) return true;
  }

  return false;
}

function resolvePackedTarball(packOutput, destinationDir) {
  const lines = packOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const tarball = lines.reverse().find((line) => line.endsWith(".tgz"));
  if (!tarball) return undefined;
  return path.isAbsolute(tarball) ? tarball : path.resolve(destinationDir, tarball);
}

async function checkPackageInstallSmoke({ root, packageName, run = runCapture }) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "demo-machine-package-smoke-"));
  try {
    const packDir = path.join(tempRoot, "pack");
    const installDir = path.join(tempRoot, "install");
    await mkdir(packDir, { recursive: true });
    await mkdir(installDir, { recursive: true });

    const packArgs = ["pack", "--pack-destination", packDir];
    const pack = run("pnpm", packArgs, root);
    if (pack.error) {
      return fail(`pnpm pack could not start: ${pack.error.message}`);
    }
    if (pack.status !== 0) {
      return fail(commandDetail("pnpm", packArgs, pack));
    }

    const tarballPath = resolvePackedTarball(`${pack.stdout ?? ""}\n${pack.stderr ?? ""}`, packDir);
    if (!tarballPath || !(await exists(tarballPath))) {
      return fail("pnpm pack did not produce a discoverable .tgz tarball");
    }

    const initArgs = ["init", "-y"];
    const init = run("npm", initArgs, installDir);
    if (init.error) {
      return fail(`npm init could not start: ${init.error.message}`);
    }
    if (init.status !== 0) {
      return fail(commandDetail("npm", initArgs, init));
    }

    const installArgs = ["install", "--omit=optional", "--no-audit", "--no-fund", tarballPath];
    const install = run("npm", installArgs, installDir);
    if (install.error) {
      return fail(`npm install could not start: ${install.error.message}`);
    }
    if (install.status !== 0) {
      return fail(commandDetail("npm", installArgs, install));
    }

    const importArgs = [
      "--input-type=module",
      "-e",
      `await import(${JSON.stringify(packageName)});`,
    ];
    const importCheck = run("node", importArgs, installDir);
    if (importCheck.error) {
      return fail(`Installed package import could not start: ${importCheck.error.message}`);
    }
    if (importCheck.status !== 0) {
      return fail(commandDetail("node", importArgs, importCheck));
    }

    const cliArgs = ["exec", "--", "demo-machine", "examples", "list", "--limit", "1"];
    const cli = run("npm", cliArgs, installDir);
    if (cli.error) {
      return fail(`Installed CLI smoke could not start: ${cli.error.message}`);
    }
    if (cli.status !== 0) {
      return fail(commandDetail("npm", cliArgs, cli));
    }

    for (const binName of ["demo-machine", "demo-machine-mcp"]) {
      if (!(await installedBinExists(installDir, binName))) {
        return fail(`Installed package is missing bin shim: ${binName}`);
      }
    }

    const packageDir = path.join(installDir, "node_modules", ...packagePathParts(packageName));
    const remotionRoot = path.join(packageDir, "remotion", "src", "Root.tsx");
    if (!(await exists(remotionRoot))) {
      return fail("Installed package is missing remotion/src/Root.tsx");
    }

    return pass(
      "Package tarball installs, imports, runs installed CLI shims, and includes Remotion assets",
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function checkPackageReadiness({
  root = process.cwd(),
  dryRun = true,
  installSmoke = true,
  run = runCapture,
} = {}) {
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
    const result = run("pnpm", ["pack", "--dry-run"], root);
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

  if (installSmoke) {
    results.push(await checkPackageInstallSmoke({ root, packageName: pkg.name, run }));
  } else {
    results.push(warn("Skipped package install smoke"));
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
  if (opts.checks.includes("showcase")) {
    results.push(...(await checkShowcaseAssets({ root })));
  }
  if (opts.checks.includes("package")) {
    results.push(
      ...(await checkPackageReadiness({
        root,
        dryRun: opts.packageDryRun,
        installSmoke: opts.packageSmoke,
      })),
    );
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
