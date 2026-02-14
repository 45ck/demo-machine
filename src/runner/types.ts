import type { ChildProcess } from "node:child_process";

export interface RunnerHandle {
  url: string;
  process?: ChildProcess;
  stop: () => Promise<void>;
}

export interface RunnerOptions {
  command?: string;
  url: string;
  healthcheck?: string;
  timeout: number;
}
