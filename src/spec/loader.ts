import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { demoSpecSchema } from "./schema.js";
import type { DemoSpec } from "./types.js";

export class SpecLoadError extends Error {
  public readonly detail?: unknown;

  constructor(message: string, detail?: unknown) {
    super(message);
    this.name = "SpecLoadError";
    this.detail = detail;
  }
}

type SupportedFormat = "yaml" | "json" | "json5" | "toml";
export type SerializeFormat = "json" | "yaml";

export const SUPPORTED_EXTENSIONS = [
  ".yaml",
  ".yml",
  ".json",
  ".json5",
  ".jsonc",
  ".toml",
] as const;

function resolveFormat(filePath: string): SupportedFormat {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".yaml":
    case ".yml":
      return "yaml";
    case ".json":
      return "json";
    case ".jsonc":
      return "json5";
    case ".json5":
      return "json5";
    case ".toml":
      return "toml";
    default:
      throw new SpecLoadError(
        `Unsupported file extension "${ext}". Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`,
      );
  }
}

async function parseContent(raw: string, format: SupportedFormat): Promise<unknown> {
  switch (format) {
    case "yaml":
      return parseYaml(raw);
    case "json":
      return JSON.parse(raw) as unknown;
    case "json5": {
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
      let mod: { parse(text: string): unknown };
      try {
        mod = (await import("json5" as string)) as { parse(text: string): unknown };
      } catch {
        throw new SpecLoadError("json5 package not installed. Run: pnpm add json5");
      }
      return mod.parse(raw);
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
    }
    case "toml": {
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
      let mod: { parse(text: string): unknown };
      try {
        mod = (await import("@iarna/toml" as string)) as { parse(text: string): unknown };
      } catch {
        throw new SpecLoadError("@iarna/toml package not installed. Run: pnpm add @iarna/toml");
      }
      return mod.parse(raw);
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
    }
  }
}

export async function loadSpec(filePath: string): Promise<DemoSpec> {
  const format = resolveFormat(filePath);

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    throw new SpecLoadError(`Failed to read spec file: ${filePath}`, err);
  }

  // Strip BOM
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }

  if (raw.trim().length === 0) {
    throw new SpecLoadError(`Spec file is empty: ${filePath}`);
  }

  let parsed: unknown;
  try {
    parsed = await parseContent(raw, format);
  } catch (err) {
    if (err instanceof SpecLoadError) throw err;
    throw new SpecLoadError(`Failed to parse ${format.toUpperCase()} in: ${filePath}`, err);
  }

  const result = demoSpecSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new SpecLoadError(`Invalid spec in ${filePath}:\n${issues}`);
  }

  return result.data;
}

export function validateSpec(data: unknown): DemoSpec {
  const result = demoSpecSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new SpecLoadError(`Invalid spec:\n${issues}`);
  }
  return result.data;
}

export function serializeSpec(spec: DemoSpec, format: SerializeFormat): string {
  switch (format) {
    case "json":
      return JSON.stringify(spec, null, 2) + "\n";
    case "yaml":
      return stringifyYaml(spec);
  }
}
