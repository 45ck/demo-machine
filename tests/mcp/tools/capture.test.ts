import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCaptureTool } from "../../../src/mcp/tools/capture.js";
import type { ActionEvent } from "../../../src/playback/types.js";
import type { DemoSpec } from "../../../src/spec/types.js";

vi.mock("../../../src/pipeline.js", () => ({
  captureFromSpec: vi.fn(),
}));

const fakeResult = {
  videoPath: "./output/output.mp4",
  events: [{} as ActionEvent, {} as ActionEvent],
  spec: {
    meta: { title: "My Demo", resolution: { width: 1920, height: 1080 } },
    chapters: [],
  } as unknown as DemoSpec,
  startTimestamp: 1000,
};

describe("capture-spec tool", () => {
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
    registerCaptureTool(server);
  });

  it("registers the capture-spec tool", () => {
    expect(registeredTools.has("capture-spec")).toBe(true);
  });

  it("captures with default options and returns summary JSON", async () => {
    const { captureFromSpec } = await import("../../../src/pipeline.js");
    vi.mocked(captureFromSpec).mockResolvedValue(fakeResult);

    const handler = registeredTools.get("capture-spec")!.handler;
    const result = (await handler({ specPath: "test.demo.yaml" })) as {
      content: Array<{ type: string; text: string }>;
    };

    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed["videoPath"]).toBe("./output/output.mp4");
    expect(parsed["eventCount"]).toBe(2);
    expect(parsed["title"]).toBe("My Demo");
  });

  it("defaults narration to false", async () => {
    const { captureFromSpec } = await import("../../../src/pipeline.js");
    vi.mocked(captureFromSpec).mockResolvedValue(fakeResult);

    const handler = registeredTools.get("capture-spec")!.handler;
    await handler({ specPath: "test.demo.yaml" });

    expect(captureFromSpec).toHaveBeenCalledWith(
      resolve("test.demo.yaml"),
      expect.objectContaining({ narration: false, edit: false }),
    );
  });

  it("passes narration: true when explicitly requested", async () => {
    const { captureFromSpec } = await import("../../../src/pipeline.js");
    vi.mocked(captureFromSpec).mockResolvedValue(fakeResult);

    const handler = registeredTools.get("capture-spec")!.handler;
    await handler({ specPath: "test.demo.yaml", narration: true });

    expect(captureFromSpec).toHaveBeenCalledWith(
      resolve("test.demo.yaml"),
      expect.objectContaining({ narration: true }),
    );
  });

  it("returns error response on capture failure", async () => {
    const { captureFromSpec } = await import("../../../src/pipeline.js");
    vi.mocked(captureFromSpec).mockRejectedValue(new Error("Browser launch failed"));

    const handler = registeredTools.get("capture-spec")!.handler;
    const result = (await handler({ specPath: "test.demo.yaml" })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Browser launch failed");
  });

  it("stringifies non-Error thrown values", async () => {
    const { captureFromSpec } = await import("../../../src/pipeline.js");
    vi.mocked(captureFromSpec).mockRejectedValue("raw string error");

    const handler = registeredTools.get("capture-spec")!.handler;
    const result = (await handler({ specPath: "test.demo.yaml" })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("raw string error");
  });
});
