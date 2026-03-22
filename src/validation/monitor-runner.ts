import type { Page } from "playwright";
import type { CaptureMonitor, MonitorIssue } from "./monitor-types.js";

/** Default monitors to attach during capture. */
function createDefaultMonitors(): CaptureMonitor[] {
  return [];
}

/** Attach monitors to a Playwright page. */
export async function attachMonitors(
  page: Page,
  monitors?: CaptureMonitor[],
): Promise<CaptureMonitor[]> {
  const active = monitors ?? createDefaultMonitors();
  for (const m of active) {
    await m.attach(page);
  }
  return active;
}

/** Collect all issues from attached monitors. */
export function collectIssues(monitors: CaptureMonitor[]): MonitorIssue[] {
  return monitors.flatMap((m) => m.issues());
}
