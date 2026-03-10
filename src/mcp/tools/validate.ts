import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerValidateTool(server: McpServer): void {
  server.tool(
    "validate-spec",
    "Load and validate a demo spec file, returning a summary or errors",
    { specPath: z.string().describe("Path to the .demo.yaml spec file") },
    async ({ specPath }) => {
      try {
        // MCP server runs with user permissions; any path accessible to the process is valid.
        const path = await import("node:path");
        const resolvedPath = path.resolve(specPath);
        const { loadSpec } = await import("../../spec/loader.js");
        const spec = await loadSpec(resolvedPath);
        const totalSteps = spec.chapters.reduce((sum, ch) => sum + ch.steps.length, 0);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  valid: true,
                  title: spec.meta.title,
                  chapters: spec.chapters.length,
                  totalSteps,
                  resolution: spec.meta.resolution,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  valid: false,
                  error: err instanceof Error ? err.message : String(err),
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
