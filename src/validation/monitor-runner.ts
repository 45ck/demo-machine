import type { CaptureMonitor, MonitorIssue } from "./monitor-types.js";
import { ConsoleMonitor } from "./monitors/console-monitor.js";
import { DialogMonitor } from "./monitors/dialog-monitor.js";
import { NetworkMonitor } from "./monitors/network-monitor.js";
import { PageLifecycleMonitor } from "./monitors/page-lifecycle-monitor.js";

interface AttachOptions {
  runnerUrl?: string;
}

/** Attach monitors to a page. Returns monitor instances synchronously. */
export function attachMonitors(page: unknown, _opts?: AttachOptions): CaptureMonitor[] {
  const monitors: CaptureMonitor[] = [
    new ConsoleMonitor(),
    new DialogMonitor(),
    new NetworkMonitor(),
    new PageLifecycleMonitor(),
  ];

  for (const monitor of monitors) {
    void monitor.attach(page as never);
  }

  return monitors;
}

/** Collect all issues from attached monitors. */
export function collectIssues(monitors: CaptureMonitor[]): MonitorIssue[] {
  return monitors.flatMap((m) => {
    void m.detach();
    return m.issues();
  });
}
