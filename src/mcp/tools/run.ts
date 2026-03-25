import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerRunTool(server: McpServer): void {
  server.tool(
    "run-pipeline",
    "Run the full demo pipeline: capture + edit + narrate",
    {
      specPath: z.string().describe("Path to the .demo.yaml spec file"),
      output: z.string().optional().describe("Output directory"),
      narration: z.boolean().optional().describe("Enable narration (default true)"),
      headless: z.boolean().optional().describe("Run browser in headless mode (default true)"),
      renderer: z.string().optional().describe("Renderer: ffmpeg (default)"),
      ttsProvider: z
        .string()
        .optional()
        .describe("TTS provider: kokoro | openai | elevenlabs | piper"),
      selectApproach: z
        .enum(["A", "B", "C", "D"])
        .optional()
        .describe(
          "Select dropdown visual approach: A (cloned listbox), B (keyboard nav), C (fake overlay, default), D (custom hook via registerCustomSelectApproach)",
        ),
    },
    async (args) => {
      try {
        // MCP server runs with user permissions; any path accessible to the process is valid.
        const path = await import("node:path");
        const resolvedPath = path.resolve(args.specPath);
        const { runFullPipeline } = await import("../../pipeline.js");
        await runFullPipeline(resolvedPath, {
          output: args.output ?? "./output",
          narration: args.narration ?? true,
          edit: true,
          renderer: args.renderer ?? "ffmpeg",
          ttsProvider: args.ttsProvider ?? "kokoro",
          headless: args.headless ?? true,
          selectApproach: args.selectApproach,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Pipeline complete. Output in: ${args.output ?? "./output"}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Pipeline failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
