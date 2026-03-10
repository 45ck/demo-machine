import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerListVoicesTool(server: McpServer): void {
  server.tool("list-voices", "List all configured voice entries for TTS narration", async () => {
    try {
      const { listVoices } = await import("../../narration/voice-config.js");
      const voices = await listVoices();
      if (voices.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No voices configured. Use `demo-machine voices clone` to add one.",
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(voices, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to list voices: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  });
}
