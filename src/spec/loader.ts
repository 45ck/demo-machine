import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
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

export async function loadSpec(filePath: string): Promise<DemoSpec> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    throw new SpecLoadError(`Failed to read spec file: ${filePath}`, err);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new SpecLoadError(`Failed to parse YAML in: ${filePath}`, err);
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
