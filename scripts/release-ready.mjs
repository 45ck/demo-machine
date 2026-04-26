#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const opts = {
    smoke: true,
    video: true,
    package: true,
    smokeTier: "pr",
    smokeType: "showcase",
    smokeLimit: 2,
    outputDir: "output/release-ready-pr",
    launchChromium: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--skip-smoke") {
      opts.smoke = false;
    } else if (arg === "--skip-video") {
      opts.video = false;
    } else if (arg === "--skip-package") {
      opts.package = false;
    } else if (arg === "--smoke-tier") {
      opts.smokeTier = argv[++i] ?? opts.smokeTier;
    } else if (arg === "--smoke-type") {
      opts.smokeType = argv[++i] ?? opts.smokeType;
    } else if (arg === "--smoke-limit") {
      const raw = argv[++i];
      opts.smokeLimit = raw === "all" ? null : Number(raw);
    } else if (arg === "--output-dir") {
      opts.outputDir = argv[++i] ?? opts.outputDir;
    } else if (arg === "--launch-chromium") {
      opts.launchChromium = true;
    } else if (arg === "-h" || arg === "--help") {
      opts.help = true;
    }
  }

  return opts;
}

function usage() {
  console.log(
    [
      "release-ready",
      "",
      "Usage:",
      "  node scripts/release-ready.mjs [--skip-smoke] [--skip-video] [--skip-package] [--smoke-tier pr] [--smoke-type showcase] [--smoke-limit <n|all>] [--output-dir <dir>] [--launch-chromium]",
      "",
      "Default flow:",
      "  tool + gallery gates, build, validate, PR-tier example validation, PR-tier run smoke, video assurance, package dry-run gate",
    ].join("\n"),
  );
}

function resolveCommand(command) {
  if (process.platform !== "win32") return command;
  if (command === "pnpm") return "pnpm.cmd";
  if (command === "node") return "node.exe";
  return command;
}

function needsShell(command) {
  return process.platform === "win32" && command === "pnpm";
}

function runStep(label, command, args, { cwd }) {
  return new Promise((resolve, reject) => {
    console.log(`\n> ${label}`);
    const child = spawn(resolveCommand(command), args, {
      cwd,
      stdio: "inherit",
      shell: needsShell(command),
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} failed with exit code ${code ?? "unknown"}`));
      }
    });
  });
}

function exampleFilterArgs(opts) {
  return ["--release-tier", opts.smokeTier, "--suite-type", opts.smokeType, "--canonical-only"];
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }
  if (opts.smokeLimit != null && (!Number.isInteger(opts.smokeLimit) || opts.smokeLimit <= 0)) {
    console.error("--smoke-limit must be a positive integer or 'all'.");
    process.exit(2);
  }

  const root = path.resolve(".");
  const toolGateArgs = ["scripts/release-gates.mjs", "--checks", "tools,gallery"];
  if (opts.launchChromium) toolGateArgs.push("--launch-chromium");

  await runStep("release gates: tools + gallery", "node", toolGateArgs, { cwd: root });
  await runStep("build", "pnpm", ["build"], { cwd: root });
  await runStep("validate", "pnpm", ["validate"], { cwd: root });
  await runStep(
    `${opts.smokeTier} ${opts.smokeType} example validation`,
    "node",
    ["scripts/examples-suite.mjs", "--mode", "validate", "--no-build", ...exampleFilterArgs(opts)],
    { cwd: root },
  );

  if (opts.smoke) {
    const smokeArgs = [
      "scripts/examples-suite.mjs",
      "--mode",
      "run",
      "--no-build",
      "--output-dir",
      opts.outputDir,
      ...exampleFilterArgs(opts),
    ];
    if (opts.smokeLimit != null) smokeArgs.push("--limit", String(opts.smokeLimit));
    await runStep(`${opts.smokeTier} ${opts.smokeType} capture/render smoke`, "node", smokeArgs, {
      cwd: root,
    });
  } else {
    console.log("\n[skip] PR-tier capture/render smoke");
  }

  if (opts.video) {
    await runStep(
      "video assurance",
      "node",
      ["scripts/video-assurance.mjs", "--output-dir", opts.outputDir],
      { cwd: root },
    );
  } else {
    console.log("\n[skip] video assurance");
  }

  if (opts.package) {
    await runStep(
      "release gates: package dry-run",
      "node",
      ["scripts/release-gates.mjs", "--checks", "package"],
      { cwd: root },
    );
  } else {
    console.log("\n[skip] package dry-run gate");
  }

  console.log("\nRelease readiness checks passed.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
