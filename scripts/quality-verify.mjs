#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

function parseArgs(argv) {
  return {
    strictCoverage: argv.includes("--strict-coverage"),
    json: argv.includes("--json"),
  };
}

function uniq(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function relativeSpecPath(specPath) {
  return specPath.replaceAll("\\", "/");
}

const STANDALONE_SPECS = new Set(["examples/meta-demo.demo.yaml"]);

function collectStepTargetStrategies(step, targetStrategies) {
  if (typeof step?.selector === "string" && step.selector.trim().length > 0) {
    targetStrategies.add("css");
  }
  if (typeof step?.target?.by === "string") {
    targetStrategies.add(step.target.by);
  }

  for (const endpoint of [step?.from, step?.to]) {
    if (!endpoint) continue;
    if (typeof endpoint.selector === "string" && endpoint.selector.trim().length > 0) {
      targetStrategies.add("css");
    }
    if (typeof endpoint.target?.by === "string") {
      targetStrategies.add(endpoint.target.by);
    }
  }
}

function collectProofFromSpec(doc) {
  const actions = new Set();
  const preSteps = new Set();
  const targetStrategies = new Set();

  for (const preStep of doc?.preSteps ?? []) {
    if (typeof preStep?.action === "string") {
      preSteps.add(preStep.action);
    }
  }

  for (const chapter of doc?.chapters ?? []) {
    for (const step of chapter?.steps ?? []) {
      if (typeof step?.action === "string") {
        actions.add(step.action);
      }
      collectStepTargetStrategies(step, targetStrategies);
    }
  }

  return {
    actions: uniq([...actions]),
    preSteps: uniq([...preSteps]),
    targetStrategies: uniq([...targetStrategies]),
  };
}

async function loadJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, "..");
  const examplesDir = path.join(root, "examples");

  const inventory = await loadJson(path.join(root, "docs", "verification-inventory.json"));
  const manifest = await loadJson(path.join(root, "examples", "manifest.json"));
  const galleryManifest = await loadJson(
    path.join(root, "assets", "demo-gallery", "manifest.json"),
  );

  const errors = [];
  const coverageGaps = [];
  const inventoryActions = inventory.actions.map((entry) => entry.id);
  const inventoryPreSteps = inventory.preSteps.map((entry) => entry.id);
  const inventoryTargetStrategies = inventory.targetStrategies.map((entry) => entry.id);
  const inventoryPatternTags = inventory.patternTags.map((entry) => entry.id);
  const inventoryQualitySignals = inventory.qualitySignals.map((entry) => entry.id);

  const suites = manifest.suites ?? [];
  const slugs = new Set();
  const accountedSpecs = new Set();
  const tierCounts = new Map();
  const coveredPatternTags = new Set();
  const coveredQualitySignals = new Set();
  const gallerySlugs = new Set((galleryManifest.results ?? []).map((entry) => entry.slug));

  for (const suite of suites) {
    if (slugs.has(suite.slug)) {
      errors.push(`Duplicate suite slug in examples/manifest.json: ${suite.slug}`);
    }
    slugs.add(suite.slug);

    if (!["pr", "nightly"].includes(suite.releaseTier)) {
      errors.push(`Suite "${suite.slug}" has invalid releaseTier "${suite.releaseTier}"`);
    }
    if (!["gallery", "none"].includes(suite.visualBaseline)) {
      errors.push(`Suite "${suite.slug}" has invalid visualBaseline "${suite.visualBaseline}"`);
    }

    tierCounts.set(suite.releaseTier, (tierCounts.get(suite.releaseTier) ?? 0) + 1);

    for (const patternTag of suite.patternTags ?? []) {
      if (!inventoryPatternTags.includes(patternTag)) {
        errors.push(`Suite "${suite.slug}" uses unknown pattern tag "${patternTag}"`);
      }
      coveredPatternTags.add(patternTag);
    }
    for (const qualitySignal of suite.qualitySignals ?? []) {
      if (!inventoryQualitySignals.includes(qualitySignal)) {
        errors.push(`Suite "${suite.slug}" uses unknown quality signal "${qualitySignal}"`);
      }
      coveredQualitySignals.add(qualitySignal);
    }

    if (suite.visualBaseline === "gallery" && !gallerySlugs.has(suite.slug)) {
      errors.push(
        `Suite "${suite.slug}" expects gallery assets but assets/demo-gallery/manifest.json has no entry`,
      );
    }

    for (const specPath of [suite.canonicalSpec, ...(suite.variantSpecs ?? [])]) {
      const relativePath = relativeSpecPath(specPath);
      if (accountedSpecs.has(relativePath)) {
        errors.push(`Spec is referenced more than once in examples/manifest.json: ${relativePath}`);
      }
      accountedSpecs.add(relativePath);
    }
  }

  const exampleFiles = await readdir(examplesDir, { withFileTypes: true });
  const actualSpecs = uniq(
    exampleFiles
      .filter((entry) => entry.isFile() && /\.demo\.ya?ml$/i.test(entry.name))
      .map((entry) => relativeSpecPath(path.posix.join("examples", entry.name)))
      .filter((spec) => !STANDALONE_SPECS.has(spec)),
  );

  for (const spec of actualSpecs) {
    if (!accountedSpecs.has(spec)) {
      errors.push(`Spec is not represented in examples/manifest.json: ${spec}`);
    }
  }
  for (const spec of accountedSpecs) {
    if (!actualSpecs.includes(spec)) {
      errors.push(`examples/manifest.json references a missing spec: ${spec}`);
    }
  }

  const provenActions = new Set();
  const provenPreSteps = new Set();
  const provenTargetStrategies = new Set();

  for (const spec of actualSpecs) {
    const specPath = path.join(root, spec);
    const doc = YAML.parse(await readFile(specPath, "utf8"));
    const proof = collectProofFromSpec(doc);

    for (const action of proof.actions) provenActions.add(action);
    for (const preStep of proof.preSteps) provenPreSteps.add(preStep);
    for (const targetStrategy of proof.targetStrategies) provenTargetStrategies.add(targetStrategy);
  }

  const missingActions = inventoryActions.filter((id) => !provenActions.has(id));
  const missingPreSteps = inventoryPreSteps.filter((id) => !provenPreSteps.has(id));
  const missingTargetStrategies = inventoryTargetStrategies.filter(
    (id) => !provenTargetStrategies.has(id),
  );
  const missingPatternTags = inventoryPatternTags.filter((id) => !coveredPatternTags.has(id));
  const missingQualitySignals = inventoryQualitySignals.filter(
    (id) => !coveredQualitySignals.has(id),
  );

  if (missingActions.length > 0) {
    coverageGaps.push(`Supported actions without example proof: ${missingActions.join(", ")}`);
  }
  if (missingPreSteps.length > 0) {
    coverageGaps.push(`Supported preSteps without example proof: ${missingPreSteps.join(", ")}`);
  }
  if (missingTargetStrategies.length > 0) {
    coverageGaps.push(
      `Target strategies without example proof: ${missingTargetStrategies.join(", ")}`,
    );
  }
  if (missingPatternTags.length > 0) {
    coverageGaps.push(
      `Pattern tags not yet represented by a suite: ${missingPatternTags.join(", ")}`,
    );
  }
  if (missingQualitySignals.length > 0) {
    coverageGaps.push(
      `Quality signals not yet represented by a suite: ${missingQualitySignals.join(", ")}`,
    );
  }

  const summary = {
    suites: suites.length,
    accountedSpecs: actualSpecs.length,
    releaseTiers: Object.fromEntries(
      [...tierCounts.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ),
    coverage: {
      actions: {
        covered: provenActions.size,
        total: inventoryActions.length,
        missing: missingActions,
      },
      preSteps: {
        covered: provenPreSteps.size,
        total: inventoryPreSteps.length,
        missing: missingPreSteps,
      },
      targetStrategies: {
        covered: provenTargetStrategies.size,
        total: inventoryTargetStrategies.length,
        missing: missingTargetStrategies,
      },
      patternTags: {
        covered: coveredPatternTags.size,
        total: inventoryPatternTags.length,
        missing: missingPatternTags,
      },
      qualitySignals: {
        covered: coveredQualitySignals.size,
        total: inventoryQualitySignals.length,
        missing: missingQualitySignals,
      },
    },
    errors,
    coverageGaps,
  };

  if (opts.strictCoverage && coverageGaps.length > 0) {
    errors.push("Coverage gaps present while running in --strict-coverage mode");
  }

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("demo-machine quality inventory");
    console.log(`- Suites: ${summary.suites}`);
    console.log(`- Accounted specs: ${summary.accountedSpecs}`);
    console.log(
      `- Release tiers: ${Object.entries(summary.releaseTiers)
        .map(([tier, count]) => `${tier}=${String(count)}`)
        .join(", ")}`,
    );
    console.log(
      `- Actions: ${summary.coverage.actions.covered}/${summary.coverage.actions.total} covered`,
    );
    console.log(
      `- PreSteps: ${summary.coverage.preSteps.covered}/${summary.coverage.preSteps.total} covered`,
    );
    console.log(
      `- Target strategies: ${summary.coverage.targetStrategies.covered}/${summary.coverage.targetStrategies.total} covered`,
    );
    console.log(
      `- Pattern tags: ${summary.coverage.patternTags.covered}/${summary.coverage.patternTags.total} represented`,
    );
    console.log(
      `- Quality signals: ${summary.coverage.qualitySignals.covered}/${summary.coverage.qualitySignals.total} represented`,
    );

    if (coverageGaps.length > 0) {
      console.log("");
      console.log("Known verification gaps:");
      for (const gap of coverageGaps) {
        console.log(`- ${gap}`);
      }
    }

    if (errors.length > 0) {
      console.log("");
      console.log("Errors:");
      for (const error of errors) {
        console.log(`- ${error}`);
      }
    }
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
