import type { CaptureMonitor, MonitorIssue } from "../monitor-types.js";

type DialogLike = {
  type(): string;
  message(): string;
  dismiss(): Promise<void>;
};

type PageLike = {
  on(event: "dialog", handler: (dialog: DialogLike) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
};

export class DialogMonitor implements CaptureMonitor {
  readonly name = "dialog";
  private _issues: MonitorIssue[] = [];
  private _handler: ((dialog: DialogLike) => void) | null = null;
  private _page: PageLike | null = null;

  attach(page: unknown): void {
    this._page = page as PageLike;

    this._handler = (dialog) => {
      const type = dialog.type();
      const severity = type === "beforeunload" ? ("error" as const) : ("warn" as const);
      this._issues.push({
        monitor: this.name,
        severity,
        message: `Unexpected ${type} dialog: "${dialog.message()}"`,
        timestamp: Date.now(),
      });
      void dialog.dismiss();
    };

    this._page.on("dialog", this._handler);
  }

  detach(): void {
    if (this._page && this._handler) {
      this._page.off("dialog", this._handler as never);
    }
    this._page = null;
    this._handler = null;
  }

  issues(): MonitorIssue[] {
    return [...this._issues];
  }
}
