import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerValidateTool } from "../../../src/mcp/tools/validate.js";

vi.mock("../../../src/spec/loader.js", () => ({
  loadSpec: vi.fn(),
}));

describe("validate-spec tool", () => {
  let server: McpServer;
  let registeredTools: Map<string, { handler: (...args: unknown[]) => Promise<unknown> }>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new McpServer({ name: "test", version: "0.0.1" }, { capabilities: { tools: {} } });
    registeredTools = new Map();
    const origTool = server.tool.bind(server);
    vi.spyOn(server, "tool").mockImplementation((...args: unknown[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as (...a: unknown[]) => Promise<unknown>;
      registeredTools.set(name, { handler });
      return origTool(...(args as Parameters<typeof origTool>));
    });
    registerValidateTool(server);
  });

  it("registers the validate-spec tool", () => {
    expect(registeredTools.has("validate-spec")).toBe(true);
  });

  it("returns valid summary for a good spec", async () => {
    const { loadSpec } = await import("../../../src/spec/loader.js");
    vi.mocked(loadSpec).mockResolvedValue({
      meta: {
        title: "Test Demo",
        resolution: { width: 1920, height: 1080 },
      },
      chapters: [
        {
          title: "Ch1",
          steps: [
            { action: "wait", timeout: 100 },
            { action: "click", selector: "#btn" },
          ],
        },
      ],
    } as Awaited<ReturnType<typeof loadSpec>>);

    const handler = registeredTools.get("validate-spec")!.handler;
    const result = (await handler({ specPath: "test.demo.yaml" })) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(loadSpec).toHaveBeenCalledWith(resolve("test.demo.yaml"));
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed["valid"]).toBe(true);
    expect(parsed["title"]).toBe("Test Demo");
    expect(parsed["chapters"]).toBe(1);
    expect(parsed["totalSteps"]).toBe(2);
  });

  it("returns error for an invalid spec", async () => {
    const { loadSpec } = await import("../../../src/spec/loader.js");
    vi.mocked(loadSpec).mockRejectedValue(new Error("Invalid spec file"));

    const handler = registeredTools.get("validate-spec")!.handler;
    const result = (await handler({
      specPath: "bad.demo.yaml",
    })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed["valid"]).toBe(false);
    expect(parsed["error"]).toContain("Invalid spec file");
    expect(result.isError).toBe(true);
  });
});
