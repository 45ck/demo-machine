#!/usr/bin/env node
/**
 * flake-quarantine.mjs — Manage the flake quarantine registry.
 *
 * Usage:
 *   node scripts/flake-quarantine.mjs --check <slug>
 *   node scripts/flake-quarantine.mjs --list
 *   node scripts/flake-quarantine.mjs --add <slug> --reason "..." [--ticket URL]
 *   node scripts/flake-quarantine.mjs --remove <slug>
 *   node scripts/flake-quarantine.mjs --help
 *
 * Exit codes:
 *   0  — success (or spec is NOT quarantined for --check)
 *   78 — spec IS quarantined (--check only; special "skip" code)
 *   1  — error
 *   2  — usage error
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REGISTRY_FILENAME = "flake-registry.json";

function parseArgs(argv) {
  const opts = {
    check: null,
    list: false,
    add: null,
    remove: null,
    reason: null,
    ticket: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") {
      opts.check = argv[++i] ?? null;
    } else if (a === "--list") {
      opts.list = true;
    } else if (a === "--add") {
      opts.add = argv[++i] ?? null;
    } else if (a === "--remove") {
      opts.remove = argv[++i] ?? null;
    } else if (a === "--reason") {
      opts.reason = argv[++i] ?? null;
    } else if (a === "--ticket") {
      opts.ticket = argv[++i] ?? null;
    } else if (a === "-h" || a === "--help") {
      opts.help = true;
    }
  }
  return opts;
}

function usage() {
  console.log(
    [
      "flake-quarantine — Manage the flake quarantine registry",
      "",
      "Usage:",
      "  node scripts/flake-quarantine.mjs --check <slug>                         Check if a spec is quarantined",
      "  node scripts/flake-quarantine.mjs --list                                 List all quarantined specs",
      '  node scripts/flake-quarantine.mjs --add <slug> --reason "..." [--ticket] Add to quarantine',
      "  node scripts/flake-quarantine.mjs --remove <slug>                        Remove from quarantine",
      "",
      "Exit codes (--check):",
      "  0   Spec is NOT quarantined (safe to fail hard)",
      "  78  Spec IS quarantined (treat failures as warnings)",
    ].join("\n"),
  );
}

function registryPath() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(scriptDir, "..", REGISTRY_FILENAME);
}

async function loadRegistry() {
  const regPath = registryPath();
  let raw;
  try {
    raw = await readFile(regPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      return { quarantined: [] };
    }
    throw err;
  }

  let registry;
  try {
    registry = JSON.parse(raw);
  } catch (parseErr) {
    console.error(`Error: failed to parse ${regPath}: ${parseErr.message}`);
    process.exit(1);
  }

  if (!registry || !Array.isArray(registry.quarantined)) {
    console.error("Error: flake-registry.json has invalid structure");
    process.exit(1);
  }

  return registry;
}

async function saveRegistry(registry) {
  await writeFile(registryPath(), JSON.stringify(registry, null, 2) + "\n", "utf8");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    usage();
    process.exit(0);
  }

  // Count how many modes are active — exactly one allowed
  const modes = [opts.check, opts.list, opts.add, opts.remove].filter(Boolean);
  if (modes.length === 0) {
    console.error("Error: provide one of --check, --list, --add, or --remove.");
    console.error('Run with --help for usage information."');
    process.exit(2);
  }
  if (modes.length > 1) {
    console.error("Error: only one mode allowed at a time.");
    process.exit(2);
  }

  const registry = await loadRegistry();

  // --check <slug>
  if (opts.check) {
    const entry = registry.quarantined.find((e) => e.slug === opts.check);
    if (entry) {
      console.log(JSON.stringify({ quarantined: true, ...entry }, null, 2));
      process.exit(78);
    }
    console.log(JSON.stringify({ quarantined: false, slug: opts.check }, null, 2));
    process.exit(0);
  }

  // --list
  if (opts.list) {
    if (registry.quarantined.length === 0) {
      console.log("No specs are currently quarantined.");
    } else {
      console.log(`Quarantined specs (${registry.quarantined.length}):`);
      for (const entry of registry.quarantined) {
        const ticket = entry.ticket ? ` (${entry.ticket})` : "";
        console.log(`  - ${entry.slug}: ${entry.reason} [since ${entry.since}]${ticket}`);
      }
    }
    process.exit(0);
  }

  // --add <slug>
  if (opts.add) {
    if (!opts.reason) {
      console.error("Error: --reason is required when adding to quarantine.");
      process.exit(2);
    }

    const existing = registry.quarantined.find((e) => e.slug === opts.add);
    if (existing) {
      console.error(`Error: "${opts.add}" is already quarantined.`);
      process.exit(1);
    }

    const entry = {
      slug: opts.add,
      since: new Date().toISOString().slice(0, 10),
      reason: opts.reason,
    };
    if (opts.ticket) {
      entry.ticket = opts.ticket;
    }

    registry.quarantined.push(entry);
    await saveRegistry(registry);
    console.log(`Added "${opts.add}" to quarantine.`);
    process.exit(0);
  }

  // --remove <slug>
  if (opts.remove) {
    const index = registry.quarantined.findIndex((e) => e.slug === opts.remove);
    if (index === -1) {
      console.error(`Error: "${opts.remove}" is not quarantined.`);
      process.exit(1);
    }

    registry.quarantined.splice(index, 1);
    await saveRegistry(registry);
    console.log(`Removed "${opts.remove}" from quarantine.`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
