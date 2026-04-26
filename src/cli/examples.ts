import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Command, InvalidArgumentError } from "commander";
import { createLogger } from "../utils/logger.js";

const log = createLogger("cli:examples");

export interface ExampleSuite {
  slug: string;
  suiteType?: ExampleSuiteType | undefined;
  canonicalSpec: string;
  variantSpecs: string[];
  releaseTier: string;
  visualBaseline: string;
  patternTags: string[];
  qualitySignals: string[];
}

interface ExamplesManifest {
  version: number;
  suites: ExampleSuite[];
}

interface ExampleFilters {
  type?: ExampleTypeFilter | undefined;
  tag?: string | undefined;
  signal?: string | undefined;
  tier?: string | undefined;
  search?: string | undefined;
  limit?: number | undefined;
}

type ExampleSuiteType = "showcase" | "assurance" | "proof";
type ExampleTypeFilter = ExampleSuiteType | "all";

const DEFAULT_EXAMPLE_TYPES = new Set(["showcase", "assurance"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: Record<string, unknown>, key: string, context: string): string {
  const raw = value[key];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error(`Invalid examples manifest: ${context}.${key} must be a non-empty string`);
  }
  return raw;
}

function readStringArray(value: Record<string, unknown>, key: string, context: string): string[] {
  const raw = value[key];
  if (!Array.isArray(raw) || !raw.every((item) => typeof item === "string")) {
    throw new Error(`Invalid examples manifest: ${context}.${key} must be an array of strings`);
  }
  return raw;
}

function readSuiteType(
  value: Record<string, unknown>,
  context: string,
): ExampleSuiteType | undefined {
  const raw = value["suiteType"];
  if (raw === undefined) return undefined;
  if (raw === "showcase" || raw === "assurance" || raw === "proof") {
    return raw;
  }
  throw new Error(
    `Invalid examples manifest: ${context}.suiteType must be one of: showcase, assurance, proof`,
  );
}

function parseExampleSuite(value: unknown, index: number): ExampleSuite {
  const context = `suites[${String(index)}]`;
  if (!isRecord(value)) {
    throw new Error(`Invalid examples manifest: ${context} must be an object`);
  }
  return {
    slug: readString(value, "slug", context),
    suiteType: readSuiteType(value, context),
    canonicalSpec: readString(value, "canonicalSpec", context),
    variantSpecs: readStringArray(value, "variantSpecs", context),
    releaseTier: readString(value, "releaseTier", context),
    visualBaseline: readString(value, "visualBaseline", context),
    patternTags: readStringArray(value, "patternTags", context),
    qualitySignals: readStringArray(value, "qualitySignals", context),
  };
}

export function parseExamplesManifest(raw: unknown): ExamplesManifest {
  if (!isRecord(raw)) {
    throw new Error("Invalid examples manifest: root must be an object");
  }
  if (typeof raw["version"] !== "number") {
    throw new Error("Invalid examples manifest: version must be a number");
  }
  const suites = raw["suites"];
  if (!Array.isArray(suites)) {
    throw new Error("Invalid examples manifest: suites must be an array");
  }
  return {
    version: raw["version"],
    suites: suites.map(parseExampleSuite),
  };
}

export async function loadExamplesManifest(rootDir = process.cwd()): Promise<ExamplesManifest> {
  const manifestPath = path.join(rootDir, "examples", "manifest.json");
  try {
    return parseExamplesManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${manifestPath}: ${err.message}`, { cause: err });
    }
    if (err instanceof Error && err.message.startsWith("Invalid examples manifest:")) {
      throw err;
    }
    throw new Error(`Unable to read examples manifest at ${manifestPath}`, { cause: err });
  }
}

function includesIgnoreCase(values: string[], expected: string): boolean {
  const normalized = expected.toLowerCase();
  return values.some((value) => value.toLowerCase() === normalized);
}

function matchesSearch(suite: ExampleSuite, search: string): boolean {
  const normalized = search.toLowerCase();
  const haystack = [
    suite.slug,
    suite.canonicalSpec,
    suite.releaseTier,
    suite.suiteType ?? "",
    suite.visualBaseline,
    ...suite.patternTags,
    ...suite.qualitySignals,
  ].join(" ");
  return haystack.toLowerCase().includes(normalized);
}

export function filterExamples(suites: ExampleSuite[], filters: ExampleFilters): ExampleSuite[] {
  let result = suites;
  if (filters.type === undefined) {
    result = result.filter((suite) => DEFAULT_EXAMPLE_TYPES.has(suite.suiteType ?? "showcase"));
  } else if (filters.type !== "all") {
    result = result.filter((suite) => (suite.suiteType ?? "showcase") === filters.type);
  }
  if (filters.tag) {
    result = result.filter((suite) => includesIgnoreCase(suite.patternTags, filters.tag!));
  }
  if (filters.signal) {
    result = result.filter((suite) => includesIgnoreCase(suite.qualitySignals, filters.signal!));
  }
  if (filters.tier) {
    const tier = filters.tier.toLowerCase();
    result = result.filter((suite) => suite.releaseTier.toLowerCase() === tier);
  }
  if (filters.search) {
    result = result.filter((suite) => matchesSearch(suite, filters.search!));
  }
  if (filters.limit !== undefined) {
    result = result.slice(0, filters.limit);
  }
  return result;
}

export function findExample(suites: ExampleSuite[], slug: string): ExampleSuite | undefined {
  const normalized = slug.toLowerCase();
  return suites.find((suite) => suite.slug.toLowerCase() === normalized);
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

export function formatExamplesList(suites: ExampleSuite[]): string {
  if (suites.length === 0) {
    return [
      "No examples matched.",
      "Try: demo-machine examples list --tag forms",
      "Or:  demo-machine examples list --search auth",
    ].join("\n");
  }

  const rows = suites.map((suite) => ({
    slug: suite.slug,
    spec: suite.canonicalSpec,
    tier: suite.releaseTier,
    type: suite.suiteType ?? "showcase",
    tags: suite.patternTags.join(","),
    signals: suite.qualitySignals.join(","),
  }));
  const widths = {
    slug: Math.max("slug".length, ...rows.map((row) => row.slug.length)),
    type: Math.max("type".length, ...rows.map((row) => row.type.length)),
    tier: Math.max("tier".length, ...rows.map((row) => row.tier.length)),
    tags: Math.max("tags".length, ...rows.map((row) => row.tags.length)),
    signals: Math.max("signals".length, ...rows.map((row) => row.signals.length)),
  };
  const lines = [
    `${pad("slug", widths.slug)}  ${pad("type", widths.type)}  ${pad("tier", widths.tier)}  ${pad("tags", widths.tags)}  ${pad("signals", widths.signals)}  spec`,
    `${"-".repeat(widths.slug)}  ${"-".repeat(widths.type)}  ${"-".repeat(widths.tier)}  ${"-".repeat(widths.tags)}  ${"-".repeat(widths.signals)}  ----`,
    ...rows.map(
      (row) =>
        `${pad(row.slug, widths.slug)}  ${pad(row.type, widths.type)}  ${pad(row.tier, widths.tier)}  ${pad(row.tags, widths.tags)}  ${pad(row.signals, widths.signals)}  ${row.spec}`,
    ),
  ];
  return lines.join("\n");
}

export function formatExampleDetails(suite: ExampleSuite): string {
  const lines = [
    suite.slug,
    "",
    `Spec: ${suite.canonicalSpec}`,
    `Type: ${suite.suiteType ?? "showcase"}`,
    `Tier: ${suite.releaseTier}`,
    `Visual baseline: ${suite.visualBaseline}`,
    `Tags: ${suite.patternTags.join(", ")}`,
    `Quality signals: ${suite.qualitySignals.join(", ")}`,
  ];

  if (suite.variantSpecs.length > 0) {
    lines.push("", "Variants:", ...suite.variantSpecs.map((variant) => `- ${variant}`));
  }

  lines.push(
    "",
    "Try it:",
    `  demo-machine run ${suite.canonicalSpec} --no-headless`,
    "",
    "Validate only:",
    `  demo-machine validate ${suite.canonicalSpec}`,
  );
  return lines.join("\n");
}

function parseLimit(raw: string): number {
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new InvalidArgumentError("--limit must be a positive integer.");
  }
  return limit;
}

function parseExampleType(raw: string): ExampleTypeFilter {
  if (raw === "showcase" || raw === "assurance" || raw === "proof" || raw === "all") {
    return raw;
  }
  throw new InvalidArgumentError("--type must be one of: showcase, assurance, proof, all.");
}

export function registerExamplesCommand(program: Command): void {
  const examples = program
    .command("examples")
    .description("Find built-in example specs to use as demo authoring references")
    .action(() => {
      examples.help();
    });

  examples
    .command("list")
    .description("List example demo specs from examples/manifest.json")
    .option(
      "--type <showcase|assurance|proof|all>",
      "Filter by example type; defaults to human-facing showcase and assurance examples",
      parseExampleType,
    )
    .option("--tag <tag>", "Filter by pattern tag, e.g. forms, auth, drag-drop")
    .option("--signal <signal>", "Filter by quality signal, e.g. selector-intent")
    .option("--tier <tier>", "Filter by release tier: pr | nightly | proof")
    .option("--search <text>", "Search slug, spec path, tags, and quality signals")
    .option("--limit <n>", "Limit the number of rows", parseLimit)
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  demo-machine examples list --tag forms",
        "  demo-machine examples list --type proof",
        "  demo-machine examples list --signal selector-intent",
        "  demo-machine examples list --search upload",
      ].join("\n"),
    )
    .action(async (opts: ExampleFilters) => {
      try {
        const manifest = await loadExamplesManifest();
        process.stdout.write(formatExamplesList(filterExamples(manifest.suites, opts)) + "\n");
      } catch (err) {
        log.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  examples
    .command("show <slug>")
    .description("Show one example spec with variants and runnable commands")
    .action(async (slug: string) => {
      try {
        const manifest = await loadExamplesManifest();
        const suite = findExample(manifest.suites, slug);
        if (!suite) {
          process.stdout.write(
            `No example matched "${slug}". Run: demo-machine examples list --search ${slug}\n`,
          );
          process.exitCode = 1;
          return;
        }
        process.stdout.write(formatExampleDetails(suite) + "\n");
      } catch (err) {
        log.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
