import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer): void {
  server.prompt(
    "create-demo-spec",
    "Generate a demo spec YAML for a given application",
    {
      appUrl: z.string().describe("The URL of the application to demo"),
      appDescription: z
        .string()
        .optional()
        .describe("Brief description of the app and what to demo"),
    },
    ({ appUrl, appDescription }) =>
      Promise.resolve({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                "Create a demo-machine spec YAML for the following application:",
                `URL: ${appUrl}`,
                appDescription ? `Description: ${appDescription}` : "",
                "",
                "The spec should include:",
                "- Appropriate meta (title, 1920x1080 resolution)",
                "- A runner section if a dev server command is needed",
                "- Chapters organized by feature area",
                "- Steps with navigate, click, type, wait actions",
                "- Narration text on key steps (placed as lead-ins before actions)",
                "- Reasonable pacing settings",
                "",
                "Output only the YAML content.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          },
        ],
      }),
  );

  server.prompt(
    "debug-demo",
    "Diagnose and fix a failing demo spec",
    {
      specPath: z.string().describe("Path to the failing spec file"),
      errorMessage: z.string().optional().describe("The error message from the failed run"),
    },
    ({ specPath, errorMessage }) =>
      Promise.resolve({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                "Debug this failing demo-machine spec:",
                `Spec file: ${specPath}`,
                errorMessage ? `Error: ${errorMessage}` : "No error message provided.",
                "",
                "Common issues to check:",
                "1. Selector not found - element may have changed or need a wait",
                "2. Timing issues - add wait steps after animations",
                "3. Navigation errors - check URL and runner config",
                "4. Missing runner command - app may not be started",
                "",
                "Please read the spec file, diagnose the issue, and suggest fixes.",
              ].join("\n"),
            },
          },
        ],
      }),
  );
}
