import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolve, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPrompts } from "../../src/mcp/prompts.js";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

type PromptMessages = {
  messages: Array<{ role: string; content: { type: string; text: string } }>;
};

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
    })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(result.messages[0]!.role).toBe("user");
    expect(text).toContain("http://localhost:3000");
    expect(text).toContain("A todo app");
    expect(text).toContain("YAML");
  });

  it("create-demo-spec works without optional description", async () => {
    const handler = registeredPrompts.get("create-demo-spec")!.handler;
    const result = (await handler({ appUrl: "http://example.com" })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain("http://example.com");
    expect(text).not.toContain("Description:");
  });

  it("debug-demo includes spec path and error message", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValueOnce("meta:\n  title: My Demo\n");

    const handler = registeredPrompts.get("debug-demo")!.handler;
    const result = (await handler({
      specPath: "my.demo.yaml",
      errorMessage: "Timeout waiting for selector #btn",
    })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain(resolve("my.demo.yaml"));
    expect(text).toContain("Timeout waiting for selector #btn");
    expect(text).toContain("meta:\n  title: My Demo");
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it("debug-demo works without optional error message", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValueOnce("meta:\n  title: My Demo\n");

    const handler = registeredPrompts.get("debug-demo")!.handler;
    const result = (await handler({ specPath: "my.demo.yaml" })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain(resolve("my.demo.yaml"));
    expect(text).toContain("No error message provided");
    expect(text).toContain("meta:\n  title: My Demo");
  });

  it("debug-demo falls back gracefully when spec file cannot be read", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));

    const handler = registeredPrompts.get("debug-demo")!.handler;
    const result = (await handler({ specPath: "missing.demo.yaml" })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain(`could not read file: ${resolve("missing.demo.yaml")}`);
    expect(text).not.toContain("ENOENT");
  });

  // --- narrate-spec ---

  it("registers narrate-spec prompt", () => {
    expect(registeredPrompts.has("narrate-spec")).toBe(true);
  });

  it("narrate-spec includes spec content and tone", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValueOnce("meta:\n  title: Demo\n");

    const handler = registeredPrompts.get("narrate-spec")!.handler;
    const result = (await handler({
      specPath: "demo.yaml",
      tone: "casual",
    })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain(resolve("demo.yaml"));
    expect(text).toContain("Tone: casual");
    expect(text).toContain("meta:\n  title: Demo");
    expect(text).toContain("narration");
  });

  it("narrate-spec defaults tone to formal", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValueOnce("meta:\n  title: Demo\n");

    const handler = registeredPrompts.get("narrate-spec")!.handler;
    const result = (await handler({ specPath: "demo.yaml" })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain("Tone: formal");
  });

  it("narrate-spec falls back when spec cannot be read", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));

    const handler = registeredPrompts.get("narrate-spec")!.handler;
    const result = (await handler({ specPath: "missing.yaml" })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain("could not read file:");
  });

  // --- heal-spec ---

  it("registers heal-spec prompt", () => {
    expect(registeredPrompts.has("heal-spec")).toBe(true);
  });

  it("heal-spec reads spec and failure artifacts", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile)
      .mockResolvedValueOnce("meta:\n  title: Broken\n")
      .mockResolvedValueOnce('{"step":2,"error":"timeout"}')
      .mockResolvedValueOnce("<html><body>Current DOM</body></html>")
      .mockResolvedValueOnce('[{"action":"click","ok":true}]');

    const handler = registeredPrompts.get("heal-spec")!.handler;
    const result = (await handler({
      specPath: "broken.demo.yaml",
      outputDir: "./my-output",
    })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain(resolve("broken.demo.yaml"));
    expect(text).toContain(resolve("./my-output"));
    expect(text).toContain("meta:\n  title: Broken");
    expect(text).toContain('"step":2');
    expect(text).toContain("Current DOM");
    expect(text).toContain("resilient selectors");
    expect(text).toContain("events.json");
    expect(text).toContain("failure.png");
    expect(readFile).toHaveBeenCalledTimes(4);
  });

  it("heal-spec defaults output dir to ./output", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile)
      .mockResolvedValueOnce("meta:\n  title: Demo\n")
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockRejectedValueOnce(new Error("ENOENT"));

    const handler = registeredPrompts.get("heal-spec")!.handler;
    const result = (await handler({ specPath: "demo.yaml" })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain(resolve("./output"));
    expect(readFile).toHaveBeenCalledTimes(4);
  });

  // --- demo-from-url ---

  it("registers demo-from-url prompt", () => {
    expect(registeredPrompts.has("demo-from-url")).toBe(true);
  });

  it("demo-from-url includes URL and description", async () => {
    const handler = registeredPrompts.get("demo-from-url")!.handler;
    const result = (await handler({
      appUrl: "http://localhost:4000",
      description: "Show the signup flow",
    })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain("http://localhost:4000");
    expect(text).toContain("Show the signup flow");
    expect(text).toContain("Accessibility-first targets");
  });

  it("demo-from-url works without description", async () => {
    const handler = registeredPrompts.get("demo-from-url")!.handler;
    const result = (await handler({ appUrl: "http://example.com" })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain("http://example.com");
    expect(text).not.toContain("Journey to demo:");
  });

  // --- translate-spec ---

  it("registers translate-spec prompt", () => {
    expect(registeredPrompts.has("translate-spec")).toBe(true);
  });

  it("translate-spec includes spec content and target language", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValueOnce(
      'meta:\n  title: "Demo"\nchapters:\n  - title: "Ch1"\n    steps:\n      - action: navigate\n        url: "/"\n        narration: "Welcome"\n',
    );

    const handler = registeredPrompts.get("translate-spec")!.handler;
    const result = (await handler({
      specPath: "demo.yaml",
      language: "French",
    })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain(resolve("demo.yaml"));
    expect(text).toContain("Target language: French");
    expect(text).toContain("Welcome");
    expect(text).toContain("product names");
  });

  it("translate-spec falls back when spec cannot be read", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));

    const handler = registeredPrompts.get("translate-spec")!.handler;
    const result = (await handler({
      specPath: "missing.yaml",
      language: "ja",
    })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain("could not read file:");
    expect(text).toContain("Target language: ja");
  });

  // --- spec-from-test ---

  it("registers spec-from-test prompt", () => {
    expect(registeredPrompts.has("spec-from-test")).toBe(true);
  });

  it("spec-from-test includes test content", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValueOnce(
      "test('login', async ({ page }) => { await page.goto('/'); });",
    );

    const handler = registeredPrompts.get("spec-from-test")!.handler;
    const result = (await handler({ testPath: "login.spec.ts" })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain(resolve("login.spec.ts"));
    expect(text).toContain("page.goto");
    expect(text).toContain("Conversion rules");
    expect(text).toContain("getByRole");
  });

  it("spec-from-test falls back when test file cannot be read", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));

    const handler = registeredPrompts.get("spec-from-test")!.handler;
    const result = (await handler({ testPath: "missing.spec.ts" })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain("could not read file:");
  });

  // --- review-demo ---

  it("registers review-demo prompt", () => {
    expect(registeredPrompts.has("review-demo")).toBe(true);
  });

  it("review-demo reads output artifacts and spec", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile)
      .mockResolvedValueOnce('[{"action":"click","timestamp":100}]')
      .mockResolvedValueOnce('{"duration":5000}')
      .mockResolvedValueOnce("WEBVTT\n\n00:00.000 --> 00:02.000\nWelcome")
      .mockResolvedValueOnce('{"complete":true}')
      .mockResolvedValueOnce("meta:\n  title: Review Me\n");

    const handler = registeredPrompts.get("review-demo")!.handler;
    const result = (await handler({
      outputDir: "./out",
      specPath: "demo.yaml",
    })) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain(resolve("./out"));
    expect(text).toContain(resolve("demo.yaml"));
    expect(text).toContain('"action":"click"');
    expect(text).toContain("duration");
    expect(text).toContain("WEBVTT");
    expect(text).toContain("Review Me");
    expect(text).toContain("Timing");
    expect(text).toContain("Artifact verification");
    expect(text).toContain("output.mp4");
    expect(readFile).toHaveBeenCalledTimes(5);
  });

  it("review-demo works without spec path", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile)
      .mockResolvedValueOnce("[]")
      .mockResolvedValueOnce("{}")
      .mockResolvedValueOnce("WEBVTT")
      .mockResolvedValueOnce('{"complete":true}');

    const handler = registeredPrompts.get("review-demo")!.handler;
    const result = (await handler({})) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain(resolve("./output"));
    expect(text).not.toContain("Spec file:");
    expect(readFile).toHaveBeenCalledTimes(4);
  });

  it("review-demo handles missing artifacts gracefully", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile)
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockRejectedValueOnce(new Error("ENOENT"));

    const handler = registeredPrompts.get("review-demo")!.handler;
    const result = (await handler({})) as PromptMessages;

    const text = result.messages[0]!.content.text;
    expect(text).toContain("could not read file:");
  });

  // --- utility functions ---

  describe("readFileOrFallback", () => {
    it("returns file content on success", async () => {
      const { readFileOrFallback } = await import("../../src/mcp/prompt-handlers.js");
      const { readFile } = await import("node:fs/promises");
      vi.mocked(readFile).mockResolvedValueOnce("file content here");

      const result = await readFileOrFallback("/some/path.txt");
      expect(result).toBe("file content here");
    });

    it("returns fallback message on ENOENT", async () => {
      const { readFileOrFallback } = await import("../../src/mcp/prompt-handlers.js");
      const { readFile } = await import("node:fs/promises");
      vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));

      const result = await readFileOrFallback("/missing/file.txt");
      expect(result).toBe("(could not read file: /missing/file.txt)");
    });
  });

  describe("msg", () => {
    it("returns a single user message with text content", async () => {
      const { msg } = await import("../../src/mcp/prompt-handlers.js");
      const result = msg("hello world");
      expect(result).toEqual({
        messages: [{ role: "user", content: { type: "text", text: "hello world" } }],
      });
    });
  });
});
