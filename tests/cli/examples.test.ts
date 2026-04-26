import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  filterExamples,
  findExample,
  formatExampleDetails,
  formatExamplesList,
  loadExamplesManifest,
  parseExamplesManifest,
  type ExampleSuite,
} from "../../src/cli/examples.js";

const suites: ExampleSuite[] = [
  {
    slug: "dashboard-table",
    suiteType: "showcase",
    canonicalSpec: "examples/showcase/dashboard-table.demo.yaml",
    variantSpecs: ["examples/proof/variants/dashboard-table-redaction.demo.yaml"],
    releaseTier: "nightly",
    visualBaseline: "gallery",
    patternTags: ["tables", "redaction"],
    qualitySignals: ["artifact-capture", "selector-intent"],
  },
  {
    slug: "controls-lab",
    suiteType: "showcase",
    canonicalSpec: "examples/showcase/controls-lab.demo.yaml",
    variantSpecs: [],
    releaseTier: "pr",
    visualBaseline: "gallery",
    patternTags: ["forms", "file-upload"],
    qualitySignals: ["artifact-capture", "accessibility-targeting"],
  },
  {
    slug: "assurance-long-demo",
    suiteType: "assurance",
    canonicalSpec: "examples/assurance/long-demo/long-demo.demo.yaml",
    variantSpecs: [],
    releaseTier: "nightly",
    visualBaseline: "none",
    patternTags: ["assurance"],
    qualitySignals: ["artifact-capture", "narration-sync"],
  },
  {
    slug: "proof-click",
    suiteType: "proof",
    canonicalSpec: "examples/proof/actions/proof-click.demo.yaml",
    variantSpecs: [],
    releaseTier: "proof",
    visualBaseline: "none",
    patternTags: ["smoke"],
    qualitySignals: ["artifact-capture", "selector-intent"],
  },
];

describe("examples CLI helpers", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it("parses the checked-in examples manifest", async () => {
    const manifest = await loadExamplesManifest(process.cwd());

    expect(manifest.suites.length).toBeGreaterThan(0);
    expect(manifest.suites.some((suite) => suite.slug === "hello-world")).toBe(true);
  });

  it("filters by tag, signal, tier, search, and limit", () => {
    expect(filterExamples(suites, { tag: "forms" }).map((suite) => suite.slug)).toEqual([
      "controls-lab",
    ]);
    expect(
      filterExamples(suites, { signal: "selector-intent" }).map((suite) => suite.slug),
    ).toEqual(["dashboard-table"]);
    expect(filterExamples(suites, { tier: "PR" }).map((suite) => suite.slug)).toEqual([
      "controls-lab",
    ]);
    expect(filterExamples(suites, { search: "redaction" }).map((suite) => suite.slug)).toEqual([
      "dashboard-table",
    ]);
    expect(filterExamples(suites, { limit: 1 })).toHaveLength(1);
  });

  it("defaults list filters to human-facing example types", () => {
    expect(filterExamples(suites, {}).map((suite) => suite.slug)).toEqual([
      "dashboard-table",
      "controls-lab",
      "assurance-long-demo",
    ]);
  });

  it("filters by example type and can include all suites", () => {
    expect(filterExamples(suites, { type: "proof" }).map((suite) => suite.slug)).toEqual([
      "proof-click",
    ]);
    expect(filterExamples(suites, { type: "all" }).map((suite) => suite.slug)).toEqual([
      "dashboard-table",
      "controls-lab",
      "assurance-long-demo",
      "proof-click",
    ]);
  });

  it("formats examples as a human-readable table", () => {
    const output = formatExamplesList(suites);

    expect(output).toContain("slug");
    expect(output).toContain("dashboard-table");
    expect(output).toContain("selector-intent");
    expect(output).toContain("examples/showcase/controls-lab.demo.yaml");
  });

  it("finds examples by slug and formats details with runnable commands", () => {
    const suite = findExample(suites, "DASHBOARD-TABLE");

    expect(suite?.slug).toBe("dashboard-table");
    expect(formatExampleDetails(suite!)).toContain(
      "demo-machine run examples/showcase/dashboard-table.demo.yaml --no-headless",
    );
  });

  it("formats empty matches with useful next commands", () => {
    const output = formatExamplesList([]);

    expect(output).toContain("No examples matched");
    expect(output).toContain("demo-machine examples list --tag forms");
  });

  it("rejects malformed manifests with a targeted error", () => {
    expect(() => parseExamplesManifest({ version: 1, suites: [{ slug: "broken" }] })).toThrow(
      "suites[0].canonicalSpec",
    );
  });

  it("rejects unknown suite types", () => {
    expect(() =>
      parseExamplesManifest({
        version: 1,
        suites: [
          {
            slug: "broken",
            suiteType: "legacy",
            canonicalSpec: "examples/broken.demo.yaml",
            variantSpecs: [],
            releaseTier: "pr",
            visualBaseline: "none",
            patternTags: [],
            qualitySignals: [],
          },
        ],
      }),
    ).toThrow("suites[0].suiteType");
  });

  it("loads a manifest from a supplied root directory", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "demo-machine-examples-"));
    const examplesDir = join(tempDir, "examples");
    await mkdir(examplesDir);
    await writeFile(
      join(examplesDir, "manifest.json"),
      JSON.stringify({ version: 1, suites }, null, 2),
      "utf8",
    );

    const manifest = await loadExamplesManifest(tempDir);
    const raw = JSON.parse(await readFile(join(examplesDir, "manifest.json"), "utf8")) as {
      suites: unknown[];
    };

    expect(manifest.suites).toHaveLength(raw.suites.length);
  });
});
