import type { RunnerConfig } from "../spec/types.js";
import type { RunnerHandle, RunnerOptions } from "./types.js";
import { spawnProcess, killProcessTree, waitForUrl } from "../utils/process.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("runner");

export async function startRunner(options: RunnerOptions): Promise<RunnerHandle> {
  if (options.command) {
    return startWithCommand(options);
  }
  return startWithoutCommand(options);
}

export function createRunnerOptions(config: RunnerConfig): RunnerOptions {
  const options: RunnerOptions = {
    url: config.url,
    timeout: config.timeout,
  };
  if (config.command !== undefined) {
    options.command = config.command;
  }
  if (config.healthcheck !== undefined) {
    options.healthcheck = config.healthcheck;
  }
  return options;
}

async function startWithCommand(options: RunnerOptions): Promise<RunnerHandle> {
  logger.info(`Spawning: ${options.command!}`);

  // Runner commands are user-authored strings and often rely on shell resolution
  // (e.g. pnpm, npm, env var expansion). Use a shell for consistent cross-platform behavior.
  const { process: child } = spawnProcess(options.command!, [], { shell: true });
  const pid = child.pid;

  if (pid === undefined) {
    throw new Error("Failed to start process");
  }

  const healthUrl = options.healthcheck ?? options.url;
  logger.info(`Waiting for ${healthUrl}`);

  try {
    await waitForUrl(healthUrl, options.timeout);
  } catch (error) {
    logger.info(`Health check failed, cleaning up process (PID: ${String(pid)})`);
    await killProcessTree(pid);
    throw error;
  }

  logger.info("Health check passed");

  return {
    url: options.url,
    process: child,
    async stop(): Promise<void> {
      logger.info(`Stopping process tree (PID: ${String(pid)})`);
      await killProcessTree(pid);
    },
  };
}

async function startWithoutCommand(options: RunnerOptions): Promise<RunnerHandle> {
  const healthUrl = options.healthcheck ?? options.url;
  logger.info(`Verifying URL is reachable: ${healthUrl}`);
  await waitForUrl(healthUrl, options.timeout);
  logger.info("URL is reachable");

  return {
    url: options.url,
    async stop(): Promise<void> {
      // No process to stop
    },
  };
}
