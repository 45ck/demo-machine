import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerFormatTool(server: McpServer): void {
  server.tool(
    "format-spec",
    "Load a demo spec and serialize it to a target format (json or yaml)",
    {
      specPath: z.string().describe("Path to the .demo.yaml spec file"),
      format: z.enum(["json", "yaml"]).optional().describe("Output format (default: yaml)"),
    },
    async ({ specPath, format: rawFormat }) => {
      try {
        // MCP server runs with user permissions; any path accessible to the process is valid.
        const path = await import("node:path");
        const resolvedPath = path.resolve(specPath);
        const { loadSpec, serializeSpec } = await import("../../spec/loader.js");
        const spec = await loadSpec(resolvedPath);

        let targetFormat: "json" | "yaml";
        if (rawFormat === "json") {
          targetFormat = "json";
        } else {
          targetFormat = "yaml";
        }

        const output = serializeSpec(spec, targetFormat);
        return {
          content: [{ type: "text" as const, text: output }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Format failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
