import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "..", "..");

async function readMcpDocs(): Promise<string> {
  return await readFile(resolve(repoRoot, "docs", "mcp.md"), "utf8");
}

function commonToolInputsSection(markdown: string): string {
  const start = markdown.indexOf("Common tool inputs:");
  const end = markdown.indexOf("## Resources", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return markdown.slice(start, end);
}

describe("MCP docs", () => {
  it("documents current MCP tool argument names", async () => {
    const docs = commonToolInputsSection(await readMcpDocs());

    expect(docs).toContain(
      "`specPath`, `output`, `headless`, `narration`, `ttsProvider`, `selectApproach`, `overwrite`",
    );
    expect(docs).toContain(
      "`specPath`, `output`, `headless`, `narration`, `renderer`, `ttsProvider`, `selectApproach`, `overwrite`",
    );
    expect(docs).not.toContain("`outputDir`");
    expect(docs).not.toContain("skipNarration");
  });
});
