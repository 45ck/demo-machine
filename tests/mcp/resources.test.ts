import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResources } from "../../src/mcp/resources.js";

describe("MCP resources", () => {
  let server: McpServer;
  let registeredResources: Map<string, { handler: () => Promise<unknown> }>;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" }, { capabilities: { resources: {} } });
    registeredResources = new Map();
    const origResource = server.resource.bind(server);
    vi.spyOn(server, "resource").mockImplementation((...args: unknown[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as () => Promise<unknown>;
      registeredResources.set(name, { handler });
      return origResource(...(args as Parameters<typeof origResource>));
    });
    registerResources(server);
  });

  it("registers basic-template resource", () => {
    expect(registeredResources.has("basic-template")).toBe(true);
  });

  it("registers actions-docs resource", () => {
    expect(registeredResources.has("actions-docs")).toBe(true);
  });

  it("registers spec-format-docs resource", () => {
    expect(registeredResources.has("spec-format-docs")).toBe(true);
  });

  it("basic-template returns YAML content with correct URI", async () => {
    const handler = registeredResources.get("basic-template")!.handler;
    const result = (await handler()) as {
      contents: Array<{ uri: string; mimeType: string; text: string }>;
    };
    expect(result.contents[0]!.uri).toBe("demo-machine://templates/basic");
    expect(result.contents[0]!.text).toContain("meta:");
    expect(result.contents[0]!.text).toContain("chapters:");
  });

  it("actions-docs returns markdown with action table", async () => {
    const handler = registeredResources.get("actions-docs")!.handler;
    const result = (await handler()) as {
      contents: Array<{ uri: string; mimeType: string; text: string }>;
    };
    expect(result.contents[0]!.mimeType).toBe("text/markdown");
    expect(result.contents[0]!.text).toContain("navigate");
    expect(result.contents[0]!.text).toContain("click");
    expect(result.contents[0]!.text).toContain("dragAndDrop");
  });

  it("spec-format-docs returns markdown with format docs", async () => {
    const handler = registeredResources.get("spec-format-docs")!.handler;
    const result = (await handler()) as {
      contents: Array<{ uri: string; mimeType: string; text: string }>;
    };
    expect(result.contents[0]!.mimeType).toBe("text/markdown");
    expect(result.contents[0]!.text).toContain("meta");
    expect(result.contents[0]!.text).toContain("auto-sync");
  });
});
