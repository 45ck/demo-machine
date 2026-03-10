import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFormatTool } from "../../../src/mcp/tools/format.js";

vi.mock("../../../src/spec/loader.js", () => ({
  loadSpec: vi.fn(),
  serializeSpec: vi.fn(),
}));

describe("format-spec tool", () => {
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
    registerFormatTool(server);
  });

  it("registers the format-spec tool", () => {
    expect(registeredTools.has("format-spec")).toBe(true);
  });

  it("converts spec to json format", async () => {
    const { loadSpec, serializeSpec } = await import("../../../src/spec/loader.js");
    const fakeSpec = {
      meta: { title: "Test", resolution: { width: 1920, height: 1080 } },
      chapters: [],
    };
    vi.mocked(loadSpec).mockResolvedValue(fakeSpec as Awaited<ReturnType<typeof loadSpec>>);
    vi.mocked(serializeSpec).mockReturnValue('{"meta":{}}');

    const handler = registeredTools.get("format-spec")!.handler;
    const result = (await handler({
      specPath: "test.demo.yaml",
      format: "json",
    })) as { content: Array<{ type: string; text: string }> };

    expect(loadSpec).toHaveBeenCalledWith(resolve("test.demo.yaml"));
    expect(serializeSpec).toHaveBeenCalledWith(fakeSpec, "json");
    expect(result.content[0]!.text).toBe('{"meta":{}}');
  });

  it("defaults to yaml format", async () => {
    const { loadSpec, serializeSpec } = await import("../../../src/spec/loader.js");
    const fakeSpec = {
      meta: { title: "Test", resolution: { width: 1920, height: 1080 } },
      chapters: [],
    };
    vi.mocked(loadSpec).mockResolvedValue(fakeSpec as Awaited<ReturnType<typeof loadSpec>>);
    vi.mocked(serializeSpec).mockReturnValue("meta:\n  title: Test\n");

    const handler = registeredTools.get("format-spec")!.handler;
    const result = (await handler({
      specPath: "test.demo.yaml",
      format: undefined,
    })) as { content: Array<{ type: string; text: string }> };

    expect(loadSpec).toHaveBeenCalledWith(resolve("test.demo.yaml"));
    expect(serializeSpec).toHaveBeenCalledWith(fakeSpec, "yaml");
    expect(result.content[0]!.text).toContain("meta:");
  });

  it("returns error on failure", async () => {
    const { loadSpec } = await import("../../../src/spec/loader.js");
    vi.mocked(loadSpec).mockRejectedValue(new Error("File not found"));

    const handler = registeredTools.get("format-spec")!.handler;
    const result = (await handler({
      specPath: "missing.yaml",
      format: "json",
    })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("File not found");
  });
});
