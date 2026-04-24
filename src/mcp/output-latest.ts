import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export async function resolveOutputDirFromLatest(outputDir: string | undefined): Promise<string> {
  if (outputDir) return resolve(outputDir);
  const fallback = resolve("./output");
  try {
    const latestRaw = await readFile(join(fallback, "latest.json"), "utf8");
    const latest = JSON.parse(latestRaw) as { outputDir?: unknown };
    if (typeof latest.outputDir === "string" && latest.outputDir.length > 0) {
      return resolve(latest.outputDir);
    }
  } catch {
    // Fall back to the historical fixed output directory.
  }
  return fallback;
}
