import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import treeKill from "tree-kill";
import { createLogger } from "./logger.js";

const logger = createLogger("process");

export interface SpawnResult {
  process: ChildProcess;
  exited: Promise<number | null>;
}

export function spawnProcess(command: string, args: string[], options?: SpawnOptions): SpawnResult {
  const child = spawn(command, args, {
    stdio: "pipe",
    ...options,
  });

  const exited = new Promise<number | null>((resolve, reject) => {
    child.on("exit", (code) => resolve(code));
    child.on("error", (err) => reject(err));
  });

  return { process: child, exited };
}

export async function killProcessTree(pid: number): Promise<void> {
  return new Promise((resolve, reject) => {
    treeKill(pid, "SIGTERM", (err) => {
      if (err) {
        logger.warn(`Failed to kill process tree ${String(pid)}: ${String(err)}`);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  const interval = 500;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timed out waiting for ${url} after ${String(timeoutMs)}ms`);
}
