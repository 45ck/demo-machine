import type { CaptureMonitor, MonitorIssue } from "./monitor-types.js";
import { ConsoleMonitor } from "./monitors/console-monitor.js";
import { DialogMonitor } from "./monitors/dialog-monitor.js";
import { NetworkMonitor } from "./monitors/network-monitor.js";
import { PageLifecycleMonitor } from "./monitors/page-lifecycle-monitor.js";
import { RunnerHealthMonitor } from "./monitors/runner-health-monitor.js";

interface AttachOptions {
  runnerUrl?: string;
}

const runnerIssues = new WeakMap<CaptureMonitor, MonitorIssue[]>();

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message.length > 0) return err.message;
  if (typeof err === "string" && err.length > 0) return err;
  return String(err);
}

function recordRunnerIssue(
  monitor: CaptureMonitor,
  action: "attach" | "detach",
  err: unknown,
): void {
  const issues = runnerIssues.get(monitor) ?? [];
  issues.push({
    monitor: monitor.name,
    severity: "error",
    message: `Monitor ${action} failed: ${errorMessage(err)}`,
    timestamp: Date.now(),
  });
  runnerIssues.set(monitor, issues);
}

/** Attach an explicit monitor set, preserving attach failures as monitor issues. */
export async function attachMonitorInstances(
  page: unknown,
  monitors: CaptureMonitor[],
): Promise<CaptureMonitor[]> {
  for (const monitor of monitors) {
    try {
      await monitor.attach(page as never);
    } catch (err) {
      recordRunnerIssue(monitor, "attach", err);
    }
  }

  return monitors;
}

/** Attach monitors to a page. */
export async function attachMonitors(
  page: unknown,
  opts?: AttachOptions,
): Promise<CaptureMonitor[]> {
  const monitors: CaptureMonitor[] = [
    new ConsoleMonitor(),
    new DialogMonitor(),
    new NetworkMonitor(),
    new PageLifecycleMonitor(),
  ];

  if (opts?.runnerUrl) {
    monitors.push(new RunnerHealthMonitor(opts.runnerUrl));
  }

  return await attachMonitorInstances(page, monitors);
}

/** Collect all issues from attached monitors. */
export async function collectIssues(monitors: CaptureMonitor[]): Promise<MonitorIssue[]> {
  const issues: MonitorIssue[] = [];

  for (const monitor of monitors) {
    try {
      await monitor.detach();
    } catch (err) {
      recordRunnerIssue(monitor, "detach", err);
    }

    issues.push(...(runnerIssues.get(monitor) ?? []), ...monitor.issues());
  }

  return issues;
}
