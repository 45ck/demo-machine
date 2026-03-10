import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerRunTool } from "../../../src/mcp/tools/run.js";

vi.mock("../../../src/pipeline.js", () => ({
  runFullPipeline: vi.fn(),
}));

describe("run-pipeline tool", () => {
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
    registerRunTool(server);
  });

  it("registers the run-pipeline tool", () => {
    expect(registeredTools.has("run-pipeline")).toBe(true);
  });

  it("runs pipeline with default options", async () => {
    const { runFullPipeline } = await import("../../../src/pipeline.js");
    vi.mocked(runFullPipeline).mockResolvedValue(undefined);

    const handler = registeredTools.get("run-pipeline")!.handler;
    const result = (await handler({ specPath: "test.demo.yaml" })) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(runFullPipeline).toHaveBeenCalledWith(resolve("test.demo.yaml"), {
      output: "./output",
      narration: true,
      edit: true,
      renderer: "ffmpeg",
      ttsProvider: "kokoro",
      headless: true,
    });
    expect(result.content[0]!.text).toContain("Pipeline complete");
    expect(result.content[0]!.text).toContain("./output");
  });

  it("passes custom options through", async () => {
    const { runFullPipeline } = await import("../../../src/pipeline.js");
    vi.mocked(runFullPipeline).mockResolvedValue(undefined);

    const handler = registeredTools.get("run-pipeline")!.handler;
    await handler({
      specPath: "test.demo.yaml",
      output: "./custom-out",
      narration: false,
      headless: false,
      ttsProvider: "openai",
    });

    expect(runFullPipeline).toHaveBeenCalledWith(
      resolve("test.demo.yaml"),
      expect.objectContaining({
        output: "./custom-out",
        narration: false,
        headless: false,
        ttsProvider: "openai",
      }),
    );
  });

  it("returns error response on pipeline failure", async () => {
    const { runFullPipeline } = await import("../../../src/pipeline.js");
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("ffmpeg not found"));

    const handler = registeredTools.get("run-pipeline")!.handler;
    const result = (await handler({ specPath: "test.demo.yaml" })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("ffmpeg not found");
  });
});
