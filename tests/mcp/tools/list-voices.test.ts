import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListVoicesTool } from "../../../src/mcp/tools/list-voices.js";

vi.mock("../../../src/narration/voice-config.js", () => ({
  listVoices: vi.fn(),
}));

describe("list-voices tool", () => {
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
    registerListVoicesTool(server);
  });

  it("registers the list-voices tool", () => {
    expect(registeredTools.has("list-voices")).toBe(true);
  });

  it("returns message when no voices configured", async () => {
    const { listVoices } = await import("../../../src/narration/voice-config.js");
    vi.mocked(listVoices).mockResolvedValue([]);

    const handler = registeredTools.get("list-voices")!.handler;
    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]!.text).toContain("No voices configured");
  });

  it("returns voice list as JSON", async () => {
    const { listVoices } = await import("../../../src/narration/voice-config.js");
    const voices = [
      {
        name: "alice",
        voiceId: "v1",
        provider: "elevenlabs",
        createdAt: "2025-01-01",
      },
      {
        name: "bob",
        voiceId: "v2",
        provider: "openai",
        createdAt: "2025-01-02",
      },
    ];
    vi.mocked(listVoices).mockResolvedValue(voices);

    const handler = registeredTools.get("list-voices")!.handler;
    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    const parsed = JSON.parse(result.content[0]!.text) as unknown[];
    expect(parsed).toHaveLength(2);
    expect((parsed[0] as Record<string, string>)["name"]).toBe("alice");
  });

  it("returns error on failure", async () => {
    const { listVoices } = await import("../../../src/narration/voice-config.js");
    vi.mocked(listVoices).mockRejectedValue(new Error("Config corrupt"));

    const handler = registeredTools.get("list-voices")!.handler;
    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Config corrupt");
  });

  it("stringifies non-Error thrown values", async () => {
    const { listVoices } = await import("../../../src/narration/voice-config.js");
    vi.mocked(listVoices).mockRejectedValue("raw string error");

    const handler = registeredTools.get("list-voices")!.handler;
    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("raw string error");
  });
});
