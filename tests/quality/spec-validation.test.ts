import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../..");

interface ManifestSuite {
  slug: string;
  canonicalSpec: string;
  variantSpecs: string[];
}

interface Manifest {
  version: number;
  suites: ManifestSuite[];
}

async function loadManifest(): Promise<Manifest> {
  const raw = await readFile(resolve(projectRoot, "examples/manifest.json"), "utf-8");
  return JSON.parse(raw) as Manifest;
}

async function discoverSpecFiles(): Promise<string[]> {
  const entries = await readdir(resolve(projectRoot, "examples"));
  return entries.filter((f) => f.endsWith(".demo.yaml")).map((f) => `examples/${f}`);
}

describe("bulk spec validation", () => {
  it("all example specs load and validate against Zod schemas", async () => {
    const { loadSpec } = await import("../../src/spec/loader.js");
    const manifest = await loadManifest();

    const specPaths: string[] = [];
    for (const suite of manifest.suites) {
      specPaths.push(suite.canonicalSpec);
      specPaths.push(...suite.variantSpecs);
    }

    for (const specPath of specPaths) {
      const fullPath = resolve(projectRoot, specPath);
      await expect(loadSpec(fullPath)).resolves.toBeDefined();
    }
  });

  it("every discovered .demo.yaml file is referenced in manifest", async () => {
    const manifest = await loadManifest();
    const discovered = await discoverSpecFiles();

    const manifestPaths = new Set<string>();
    for (const suite of manifest.suites) {
      manifestPaths.add(suite.canonicalSpec.replace(/\\/g, "/"));
      for (const v of suite.variantSpecs) {
        manifestPaths.add(v.replace(/\\/g, "/"));
      }
    }

    for (const file of discovered) {
      const normalized = file.replace(/\\/g, "/");
      expect(
        manifestPaths.has(normalized),
        `${normalized} is not referenced in manifest.json`,
      ).toBe(true);
    }
  });

  it("manifest suite count matches discovered file count", async () => {
    const manifest = await loadManifest();
    const discovered = await discoverSpecFiles();

    let manifestSpecCount = 0;
    for (const suite of manifest.suites) {
      manifestSpecCount += 1 + suite.variantSpecs.length;
    }

    expect(manifestSpecCount).toBe(discovered.length);
  });
});
