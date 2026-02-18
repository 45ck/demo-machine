import type { BoundingBox } from "./types.js";

interface PlaywrightLocator {
  isVisible(): Promise<boolean>;
  textContent(): Promise<string | null>;
  boundingBox(): Promise<BoundingBox | null>;
}

export interface PlaywrightPage {
  goto(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  hover(selector: string): Promise<void>;
  keyboard: {
    press(key: string): Promise<void>;
    type(text: string, options?: { delay?: number | undefined }): Promise<void>;
  };
  waitForTimeout(ms: number): Promise<void>;
  locator(selector: string): PlaywrightLocator;
  evaluate(fn: string | ((...args: unknown[]) => unknown), ...args: unknown[]): Promise<unknown>;
  screenshot(options?: { path?: string }): Promise<Buffer>;
  addStyleTag(options: { content: string }): Promise<void>;
}
