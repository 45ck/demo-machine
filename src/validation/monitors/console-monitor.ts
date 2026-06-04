import type { CaptureMonitor, MonitorIssue } from "../monitor-types.js";

type PageLike = {
  on(event: "console", handler: (msg: { type(): string; text(): string }) => void): void;
  on(event: "pageerror", handler: (err: Error) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
};

const NOISE_PATTERNS = [
  /react-devtools/i,
  /download the react devtools/i,
  /\[HMR\]/,
  /\[vite\]/i,
  /favicon\.ico.*404/i,
  /hot update/i,
  /Minified React error #418/i,
];

function isNoise(text: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(text));
}

export class ConsoleMonitor implements CaptureMonitor {
  readonly name = "console";
  private _issues: MonitorIssue[] = [];
  private _consoleHandler: ((msg: { type(): string; text(): string }) => void) | null = null;
  private _errorHandler: ((err: Error) => void) | null = null;
  private _page: PageLike | null = null;

  attach(page: unknown): void {
    this._page = page as PageLike;

    this._consoleHandler = (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (!isNoise(text)) {
          this._issues.push({
            monitor: this.name,
            severity: "warn",
            message: `console.error: ${text}`,
            timestamp: Date.now(),
          });
        }
      }
    };

    this._errorHandler = (err) => {
      const text = err.message;
      if (!isNoise(text)) {
        this._issues.push({
          monitor: this.name,
          severity: "error",
          message: `Page error: ${text}`,
          timestamp: Date.now(),
        });
      }
    };

    this._page.on("console", this._consoleHandler);
    this._page.on("pageerror", this._errorHandler);
  }

  detach(): void {
    if (this._page) {
      if (this._consoleHandler) this._page.off("console", this._consoleHandler as never);
      if (this._errorHandler) this._page.off("pageerror", this._errorHandler as never);
    }
    this._page = null;
    this._consoleHandler = null;
    this._errorHandler = null;
  }

  issues(): MonitorIssue[] {
    return [...this._issues];
  }
}
