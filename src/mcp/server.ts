import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerValidateTool } from "./tools/validate.js";
import { registerRunTool } from "./tools/run.js";
import { registerCaptureTool } from "./tools/capture.js";
import { registerListVoicesTool } from "./tools/list-voices.js";
import { registerFormatTool } from "./tools/format.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";
import { getPackageVersion } from "../version.js";

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "demo-machine", version: getPackageVersion() },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
  );

  registerValidateTool(server);
  registerRunTool(server);
  registerCaptureTool(server);
  registerListVoicesTool(server);
  registerFormatTool(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}
