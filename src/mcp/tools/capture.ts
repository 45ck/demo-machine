import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerCaptureTool(server: McpServer): void {
  server.tool(
    "capture-spec",
    "Capture raw video from a demo spec (no editing, no narration synthesis by default)",
    {
      specPath: z.string().describe("Path to the .demo.yaml spec file"),
      output: z.string().optional().describe("Output directory"),
      headless: z.boolean().optional().describe("Run browser in headless mode (default true)"),
      narration: z
        .boolean()
        .optional()
        .describe(
          "Enable narration pre-synthesis during capture (default false). Use run-pipeline for a full narrated workflow.",
        ),
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
      overwrite: z
        .boolean()
        .optional()
        .describe(
          "Allow writing into an explicit output directory that already has demo artifacts",
        ),
    },
    async (args) => {
      try {
        // MCP server runs with user permissions; any path accessible to the process is valid.
        const path = await import("node:path");
        const resolvedPath = path.resolve(args.specPath);
        const { captureFromSpec } = await import("../../pipeline.js");
        const result = await captureFromSpec(resolvedPath, {
          ...(args.output !== undefined ? { output: args.output } : {}),
          overwrite: args.overwrite ?? false,
          narration: args.narration ?? false,
          edit: false,
          renderer: "ffmpeg",
          ttsProvider: args.ttsProvider ?? "kokoro",
          headless: args.headless ?? true,
          ...(args.selectApproach ? { selectApproach: args.selectApproach } : {}),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  outputDir: result.outputDir,
                  videoPath: result.videoPath,
                  eventCount: result.events.length,
                  title: result.spec.meta.title,
                  ...(result.artifacts ? { artifacts: result.artifacts } : {}),
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
              text: `Capture failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
