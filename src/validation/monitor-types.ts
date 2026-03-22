import type { Page } from "playwright";

/** Severity of a monitor issue. */
export type MonitorSeverity = "error" | "warn";

/** Issue captured by a monitor during recording. */
export interface MonitorIssue {
  monitor: string;
  severity: MonitorSeverity;
  message: string;
  timestamp?: number;
}

/** Interface for capture monitors that observe page behavior. */
export interface CaptureMonitor {
  readonly name: string;
  attach(page: Page): void | Promise<void>;
  detach(): void | Promise<void>;
  issues(): MonitorIssue[];
}
