import type { CaptureMonitor, MonitorIssue } from "../monitor-types.js";

type RequestLike = {
  url(): string;
  failure(): { errorText: string } | null;
};

type PageLike = {
  on(event: "requestfailed", handler: (request: RequestLike) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
};

export class NetworkMonitor implements CaptureMonitor {
  readonly name = "network";
  private _issues: MonitorIssue[] = [];
  private _handler: ((request: RequestLike) => void) | null = null;
  private _page: PageLike | null = null;

  attach(page: unknown): void {
    this._page = page as PageLike;

    this._handler = (request) => {
      const failure = request.failure();
      const errorText = failure?.errorText ?? "unknown";
      this._issues.push({
        monitor: this.name,
        severity: "warn",
        message: `Request failed: ${request.url()} (${errorText})`,
        timestamp: Date.now(),
      });
    };

    this._page.on("requestfailed", this._handler);
  }

  detach(): void {
    if (this._page && this._handler) {
      this._page.off("requestfailed", this._handler as never);
    }
    this._page = null;
    this._handler = null;
  }

  issues(): MonitorIssue[] {
    return [...this._issues];
  }
}
