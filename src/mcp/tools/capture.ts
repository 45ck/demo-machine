import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerCaptureTool(server: McpServer): void {
  server.tool(
    "capture-spec",
    "Capture raw video from a demo spec (no editing)",
    {
      specPath: z.string().describe("Path to the .demo.yaml spec file"),
      output: z.string().optional().describe("Output directory"),
      headless: z.boolean().optional().describe("Run browser in headless mode (default true)"),
      ttsProvider: z
        .string()
        .optional()
        .describe("TTS provider: kokoro | openai | elevenlabs | piper"),
    },
    async (args) => {
      try {
        const { captureFromSpec } = await import("../../pipeline.js");
        const result = await captureFromSpec(args.specPath, {
          output: args.output ?? "./output",
          narration: true,
          edit: false,
          renderer: "ffmpeg",
          ttsProvider: args.ttsProvider ?? "kokoro",
          headless: args.headless ?? true,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  videoPath: result.videoPath,
                  eventCount: result.events.length,
                  title: result.spec.meta.title,
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
