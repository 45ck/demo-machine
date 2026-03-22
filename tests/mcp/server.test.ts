import { describe, it, expect, vi, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "../../src/mcp/server.js";

describe("createServer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an McpServer instance", () => {
    const server = createServer();
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe("function");
    expect(typeof server.close).toBe("function");
  });

  it("registers all 5 tools", () => {
    const toolNames: string[] = [];
    vi.spyOn(McpServer.prototype, "tool").mockImplementation((...args: unknown[]) => {
      toolNames.push(args[0] as string);
    });
    createServer();
    expect(toolNames).toContain("validate-spec");
    expect(toolNames).toContain("run-pipeline");
    expect(toolNames).toContain("capture-spec");
    expect(toolNames).toContain("list-voices");
    expect(toolNames).toContain("format-spec");
  });

  it("registers all 4 resources and 8 prompts", () => {
    const resourceNames: string[] = [];
    const promptNames: string[] = [];
    vi.spyOn(McpServer.prototype, "resource").mockImplementation((...args: unknown[]) => {
      resourceNames.push(args[0] as string);
    });
    vi.spyOn(McpServer.prototype, "prompt").mockImplementation((...args: unknown[]) => {
      promptNames.push(args[0] as string);
    });
    createServer();
    expect(resourceNames).toEqual(
      expect.arrayContaining([
        "basic-template",
        "actions-docs",
        "spec-format-docs",
        "ai-prompts-docs",
      ]),
    );
    expect(promptNames).toEqual(
      expect.arrayContaining([
        "create-demo-spec",
        "debug-demo",
        "narrate-spec",
        "heal-spec",
        "demo-from-url",
        "translate-spec",
        "spec-from-test",
        "review-demo",
      ]),
    );
  });
});
