import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach, vi } from "vitest";
import { initSpec, createStarterSpecYaml } from "../../src/cli/init.js";
import { loadSpec } from "../../src/spec/loader.js";

describe("cli init", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it("creates a valid starter spec yaml", async () => {
    const yaml = createStarterSpecYaml({
      title: "Acme Demo",
      url: "http://localhost:3000",
      command: "pnpm dev",
    });

    expect(yaml).toContain("title: Acme Demo");
    expect(yaml).toContain("mode: auto-sync");
    expect(yaml).toContain("target:");
    expect(yaml).toContain("selector: body");
    expect(yaml).toContain("action: screenshot");
  });

  it("writes a spec that loadSpec can validate", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "demo-machine-init-"));
    const specPath = join(tempDir, "my-product.demo.yaml");

    await initSpec(specPath, {
      title: "My Product",
      url: "http://localhost:3000",
      command: "pnpm dev",
      healthcheck: "http://localhost:3000/health",
    });

    const raw = await readFile(specPath, "utf8");
    expect(raw).toContain("pnpm dev");
    expect(raw).toContain("http://localhost:3000/health");

    const spec = await loadSpec(specPath);
    expect(spec.meta.title).toBe("My Product");
    expect(spec.runner.command).toBe("pnpm dev");
    expect(spec.runner.healthcheck).toBe("http://localhost:3000/health");
    expect(spec.chapters[0]!.steps.map((step) => step.action)).toEqual([
      "navigate",
      "assert",
      "wait",
      "screenshot",
    ]);
  });

  it("does not overwrite existing specs unless forced", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "demo-machine-init-"));
    const specPath = join(tempDir, "existing.demo.yaml");

    await initSpec(specPath, { url: "http://localhost:3000" });

    await expect(initSpec(specPath, { url: "http://localhost:3000" })).rejects.toThrow();

    await initSpec(specPath, {
      url: "http://localhost:3000",
      title: "Forced",
      force: true,
    });

    const spec = await loadSpec(specPath);
    expect(spec.meta.title).toBe("Forced");
  });

  it("logs installed CLI follow-up commands", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "demo-machine-init-"));
    const specPath = join(tempDir, "guided.demo.yaml");
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    let logs = "";

    try {
      await initSpec(specPath, { url: "http://localhost:3000" });
      logs = writeSpy.mock.calls.map((call) => String(call[0])).join("");
    } finally {
      writeSpy.mockRestore();
    }

    expect(logs).toContain(`demo-machine validate ${specPath}`);
    expect(logs).toContain(`demo-machine capture ${specPath} --no-narration`);
    expect(logs).not.toContain("node dist/cli.js");
    expect(logs).not.toContain("--no-edit");
  });
});
