import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChildProcess } from "node:child_process";
import type { SpawnResult } from "../../src/utils/process.js";

vi.mock("../../src/utils/process.js", () => ({
  spawnProcess: vi.fn(),
  killProcessTree: vi.fn(),
  waitForUrl: vi.fn(),
}));

import { spawnProcess, killProcessTree, waitForUrl } from "../../src/utils/process.js";
import { startRunner, createRunnerOptions } from "../../src/runner/runner.js";

const mockSpawnProcess = vi.mocked(spawnProcess);
const mockKillProcessTree = vi.mocked(killProcessTree);
const mockWaitForUrl = vi.mocked(waitForUrl);

function makeFakeProcess(pid: number): ChildProcess {
  return { pid } as unknown as ChildProcess;
}

function makeFakeSpawnResult(pid: number): SpawnResult {
  return {
    process: makeFakeProcess(pid),
    exited: new Promise(() => {}), // never resolves
  };
}

describe("startRunner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("spawns process and waits for healthcheck when command is provided", async () => {
    mockSpawnProcess.mockReturnValue(makeFakeSpawnResult(1234));
    mockWaitForUrl.mockResolvedValue(undefined);

    const handle = await startRunner({
      command: "npm start",
      url: "http://localhost:3000",
      healthcheck: "http://localhost:3000/health",
      timeout: 5000,
    });

    expect(mockSpawnProcess).toHaveBeenCalledOnce();
    expect(mockWaitForUrl).toHaveBeenCalledWith("http://localhost:3000/health", 5000);
    expect(handle.url).toBe("http://localhost:3000");
    expect(handle.process).toBeDefined();
    expect(handle.process!.pid).toBe(1234);
  });

  it("uses url as healthcheck when no healthcheck is provided", async () => {
    mockSpawnProcess.mockReturnValue(makeFakeSpawnResult(5678));
    mockWaitForUrl.mockResolvedValue(undefined);

    await startRunner({
      command: "npm start",
      url: "http://localhost:4000",
      timeout: 5000,
    });

    expect(mockWaitForUrl).toHaveBeenCalledWith("http://localhost:4000", 5000);
  });

  it("URL-only mode just checks URL reachability without spawning", async () => {
    mockWaitForUrl.mockResolvedValue(undefined);

    const handle = await startRunner({
      url: "http://localhost:8080",
      timeout: 5000,
    });

    expect(mockSpawnProcess).not.toHaveBeenCalled();
    expect(mockWaitForUrl).toHaveBeenCalledWith("http://localhost:8080", 5000);
    expect(handle.url).toBe("http://localhost:8080");
    expect(handle.process).toBeUndefined();
  });

  it("stop() kills the process tree", async () => {
    mockSpawnProcess.mockReturnValue(makeFakeSpawnResult(9999));
    mockWaitForUrl.mockResolvedValue(undefined);
    mockKillProcessTree.mockResolvedValue(undefined);

    const handle = await startRunner({
      command: "node server.js",
      url: "http://localhost:3000",
      timeout: 5000,
    });

    await handle.stop();

    expect(mockKillProcessTree).toHaveBeenCalledWith(9999);
  });

  it("throws when healthcheck times out", async () => {
    mockSpawnProcess.mockReturnValue(makeFakeSpawnResult(1111));
    mockWaitForUrl.mockRejectedValue(
      new Error("Timed out waiting for http://localhost:3000 after 500ms"),
    );
    mockKillProcessTree.mockResolvedValue(undefined);

    await expect(
      startRunner({
        command: "npm start",
        url: "http://localhost:3000",
        timeout: 500,
      }),
    ).rejects.toThrow("Timed out");

    // Process should be cleaned up on failure
    expect(mockKillProcessTree).toHaveBeenCalledWith(1111);
  });

  it("URL-only mode stop() is a no-op", async () => {
    mockWaitForUrl.mockResolvedValue(undefined);

    const handle = await startRunner({
      url: "http://localhost:8080",
      timeout: 5000,
    });

    await handle.stop();

    expect(mockKillProcessTree).not.toHaveBeenCalled();
  });
});

describe("createRunnerOptions", () => {
  it("maps RunnerConfig to RunnerOptions correctly", () => {
    const config = {
      command: "npm run dev",
      url: "http://localhost:3000",
      healthcheck: "http://localhost:3000/api/health",
      timeout: 10000,
    };

    const options = createRunnerOptions(config);

    expect(options).toEqual({
      command: "npm run dev",
      url: "http://localhost:3000",
      healthcheck: "http://localhost:3000/api/health",
      timeout: 10000,
    });
  });

  it("handles config without optional fields", () => {
    const config = {
      url: "http://localhost:3000",
      timeout: 30000,
    };

    const options = createRunnerOptions(config);

    expect(options.command).toBeUndefined();
    expect(options.healthcheck).toBeUndefined();
    expect(options.url).toBe("http://localhost:3000");
    expect(options.timeout).toBe(30000);
  });
});
