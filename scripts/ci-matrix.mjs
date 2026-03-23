#!/usr/bin/env node
/**
 * Generate a GitHub Actions matrix JSON from examples/manifest.json.
 *
 * Usage:
 *   node scripts/ci-matrix.mjs --tier pr
 *   node scripts/ci-matrix.mjs --tier nightly
 *
 * Output (stdout): JSON object with an "include" array, e.g.
 *   {"include":[{"slug":"hello-world","spec":"examples/hello-world.demo.yaml"}, ...]}
 *
 * Each suite expands its canonicalSpec AND every variantSpec into separate
 * matrix entries so each spec file gets its own shard.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const VALID_TIERS = new Set(["pr", "nightly"]);

function parseArgs(argv) {
  let tier = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--tier") {
      tier = argv[++i] ?? null;
    }
  }
  return { tier };
}

async function main() {
  const { tier } = parseArgs(process.argv.slice(2));

  if (!tier || !VALID_TIERS.has(tier)) {
    console.error(`Usage: ci-matrix.mjs --tier <pr|nightly>`);
    console.error(`  --tier pr      Only PR-tier suites`);
    console.error(`  --tier nightly All suites (PR + nightly)`);
    process.exit(2);
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, "..");
  const manifestPath = path.join(root, "examples", "manifest.json");

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const suites = manifest.suites ?? [];

  const include = [];

  for (const suite of suites) {
    // "pr" tier: only suites with releaseTier === "pr"
    // "nightly" tier: all suites
    if (tier === "pr" && suite.releaseTier !== "pr") continue;

    // Canonical spec — filter uses the basename (e.g. "spa-router.demo.yaml")
    // which is unique and safe for substring matching in examples-suite.mjs
    const slug = suite.slug;
    const canonicalFilter = path.basename(suite.canonicalSpec);
    include.push({ slug, spec: suite.canonicalSpec, filter: canonicalFilter });

    // Variant specs each get their own shard
    for (const variant of suite.variantSpecs ?? []) {
      const variantSlug = path.basename(variant).replace(/\.demo\.ya?ml$/i, "") || slug;
      const variantFilter = path.basename(variant);
      include.push({ slug: variantSlug, spec: variant, filter: variantFilter });
    }
  }

  if (include.length === 0) {
    console.error(`No suites matched tier "${tier}" — emitting empty matrix.`);
    process.stdout.write(JSON.stringify({ include: [] }) + "\n");
    process.exit(0);
  }

  // Output the matrix JSON for GitHub Actions
  const matrix = { include };
  process.stdout.write(JSON.stringify(matrix) + "\n");
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
