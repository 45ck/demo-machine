import type { BoundingBox } from "./types.js";

export interface PlaywrightLocator {
  nth(index: number): PlaywrightLocator;
  click(options?: { timeout?: number }): Promise<void>;
  hover(options?: { timeout?: number }): Promise<void>;
  fill(value: string, options?: { timeout?: number }): Promise<void>;
  setChecked(checked: boolean, options?: { timeout?: number }): Promise<void>;
  selectOption(
    values:
      | string
      | { value?: string; label?: string; index?: number }
      | Array<string | { value?: string; label?: string; index?: number }>,
    options?: { timeout?: number },
  ): Promise<void>;
  setInputFiles(files: string | string[], options?: { timeout?: number }): Promise<void>;
  dragTo(target: PlaywrightLocator, options?: { timeout?: number }): Promise<void>;
  isVisible(): Promise<boolean>;
  textContent(): Promise<string | null>;
  boundingBox(): Promise<BoundingBox | null>;
  scrollIntoViewIfNeeded(options?: { timeout?: number }): Promise<void>;
  waitFor(options?: {
    state?: "attached" | "detached" | "visible" | "hidden";
    timeout?: number;
  }): Promise<void>;
  evaluate(fn: string | ((...args: unknown[]) => unknown), ...args: unknown[]): Promise<unknown>;
}

export interface PlaywrightPage {
  goto(
    url: string,
    options?: {
      waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
      timeout?: number;
    },
  ): Promise<void>;
  goBack(options?: { timeout?: number }): Promise<unknown>;
  goForward(options?: { timeout?: number }): Promise<unknown>;
  keyboard: {
    press(key: string): Promise<void>;
    type(text: string, options?: { delay?: number | undefined }): Promise<void>;
  };
  waitForTimeout(ms: number): Promise<void>;
  locator(selector: string): PlaywrightLocator;
  getByRole(role: string, options?: { name?: string | RegExp; exact?: boolean }): PlaywrightLocator;
  getByText(text: string | RegExp, options?: { exact?: boolean }): PlaywrightLocator;
  getByTestId(testId: string): PlaywrightLocator;
  getByLabel(text: string | RegExp, options?: { exact?: boolean }): PlaywrightLocator;
  getByPlaceholder(text: string | RegExp, options?: { exact?: boolean }): PlaywrightLocator;
  getByAltText(text: string | RegExp, options?: { exact?: boolean }): PlaywrightLocator;
  getByTitle(text: string | RegExp, options?: { exact?: boolean }): PlaywrightLocator;
  evaluate(fn: string | ((...args: unknown[]) => unknown), ...args: unknown[]): Promise<unknown>;
  screenshot(options?: { path?: string }): Promise<Buffer>;
  addStyleTag(options: { content: string }): Promise<void>;
}
