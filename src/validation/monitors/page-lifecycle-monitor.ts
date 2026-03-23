import type { CaptureMonitor, MonitorIssue } from "../monitor-types.js";

type PageLike = {
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
};

export class PageLifecycleMonitor implements CaptureMonitor {
  readonly name = "page-lifecycle";
  private _issues: MonitorIssue[] = [];
  private _closeHandler: (() => void) | null = null;
  private _crashHandler: (() => void) | null = null;
  private _page: PageLike | null = null;

  attach(page: unknown): void {
    this._page = page as PageLike;

    this._closeHandler = () => {
      this._issues.push({
        monitor: this.name,
        severity: "error",
        message: "Page was unexpectedly closed during capture",
        timestamp: Date.now(),
      });
    };

    this._crashHandler = () => {
      this._issues.push({
        monitor: this.name,
        severity: "error",
        message: "Page crashed during capture",
        timestamp: Date.now(),
      });
    };

    this._page.on("close", this._closeHandler);
    this._page.on("crash", this._crashHandler);
  }

  detach(): void {
    if (this._page) {
      if (this._closeHandler) this._page.off("close", this._closeHandler);
      if (this._crashHandler) this._page.off("crash", this._crashHandler);
    }
    this._page = null;
    this._closeHandler = null;
    this._crashHandler = null;
  }

  issues(): MonitorIssue[] {
    return [...this._issues];
  }
}
