import type { CaptureMonitor, MonitorIssue } from "../monitor-types.js";

export class RunnerHealthMonitor implements CaptureMonitor {
  readonly name = "runner-health";
  private _issues: MonitorIssue[] = [];
  private _interval: ReturnType<typeof setInterval> | null = null;
  private _url: string;

  constructor(runnerUrl: string) {
    this._url = runnerUrl;
  }

  attach(_page: unknown): void {
    this._interval = setInterval(() => {
      void this._check();
    }, 5000);
  }

  private async _check(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(this._url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        this._issues.push({
          monitor: this.name,
          severity: "warn",
          message: `Runner health check returned ${String(res.status)}`,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      const isTimeoutAbort =
        err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
      this._issues.push({
        monitor: this.name,
        severity: isTimeoutAbort ? "warn" : "error",
        message: `Runner health check failed: ${String(err)}`,
        timestamp: Date.now(),
      });
    }
  }

  detach(): void {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  issues(): MonitorIssue[] {
    return [...this._issues];
  }
}
