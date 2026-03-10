import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPrompts } from "../../src/mcp/prompts.js";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

describe("MCP prompts", () => {
  let server: McpServer;
  let registeredPrompts: Map<
    string,
    { handler: (args: Record<string, string | undefined>) => Promise<unknown> }
  >;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new McpServer({ name: "test", version: "0.0.1" }, { capabilities: { prompts: {} } });
    registeredPrompts = new Map();
    const origPrompt = server.prompt.bind(server);
    vi.spyOn(server, "prompt").mockImplementation((...args: unknown[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as (
        a: Record<string, string | undefined>,
      ) => Promise<unknown>;
      registeredPrompts.set(name, { handler });
      return origPrompt(...(args as Parameters<typeof origPrompt>));
    });
    registerPrompts(server);
  });

  it("registers create-demo-spec prompt", () => {
    expect(registeredPrompts.has("create-demo-spec")).toBe(true);
  });

  it("registers debug-demo prompt", () => {
    expect(registeredPrompts.has("debug-demo")).toBe(true);
  });

  it("create-demo-spec includes app URL and description in message", async () => {
    const handler = registeredPrompts.get("create-demo-spec")!.handler;
    const result = (await handler({
      appUrl: "http://localhost:3000",
      appDescription: "A todo app",
    })) as { messages: Array<{ role: string; content: { type: string; text: string } }> };

    const text = result.messages[0]!.content.text;
    expect(result.messages[0]!.role).toBe("user");
    expect(text).toContain("http://localhost:3000");
    expect(text).toContain("A todo app");
    expect(text).toContain("YAML");
  });

  it("create-demo-spec works without optional description", async () => {
    const handler = registeredPrompts.get("create-demo-spec")!.handler;
    const result = (await handler({ appUrl: "http://example.com" })) as {
      messages: Array<{ role: string; content: { type: string; text: string } }>;
    };

    const text = result.messages[0]!.content.text;
    expect(text).toContain("http://example.com");
    expect(text).not.toContain("Description:");
  });

  it("debug-demo includes spec path and error message", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValueOnce("meta:\n  title: My Demo\n" as unknown as Buffer);

    const handler = registeredPrompts.get("debug-demo")!.handler;
    const result = (await handler({
      specPath: "my.demo.yaml",
      errorMessage: "Timeout waiting for selector #btn",
    })) as { messages: Array<{ role: string; content: { type: string; text: string } }> };

    const text = result.messages[0]!.content.text;
    expect(text).toContain(resolve("my.demo.yaml"));
    expect(text).toContain("Timeout waiting for selector #btn");
    expect(text).toContain("meta:\n  title: My Demo");
  });

  it("debug-demo works without optional error message", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValueOnce("meta:\n  title: My Demo\n" as unknown as Buffer);

    const handler = registeredPrompts.get("debug-demo")!.handler;
    const result = (await handler({ specPath: "my.demo.yaml" })) as {
      messages: Array<{ role: string; content: { type: string; text: string } }>;
    };

    const text = result.messages[0]!.content.text;
    expect(text).toContain(resolve("my.demo.yaml"));
    expect(text).toContain("No error message provided");
    expect(text).toContain("meta:\n  title: My Demo");
  });

  it("debug-demo falls back gracefully when spec file cannot be read", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));

    const handler = registeredPrompts.get("debug-demo")!.handler;
    const result = (await handler({ specPath: "missing.demo.yaml" })) as {
      messages: Array<{ role: string; content: { type: string; text: string } }>;
    };

    const text = result.messages[0]!.content.text;
    expect(text).toContain(`could not read file: ${resolve("missing.demo.yaml")}`);
    expect(text).not.toContain("ENOENT");
  });
});
