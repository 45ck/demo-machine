import { generateBlurStyles } from "../redaction/mask.js";
import { scanForSecrets } from "../redaction/secrets.js";
import { createLogger } from "../utils/logger.js";
import type { PlaywrightPage } from "./actions.js";
import { getCursorCSS } from "./cursor.js";

const logger = createLogger("playback");

export async function applyRedaction(page: PlaywrightPage, selectors: string[]): Promise<void> {
  if (selectors.length === 0) return;
  const css = generateBlurStyles(selectors);
  const pageWithInit = page as PlaywrightPage & {
    addInitScript?: (options: { content: string }) => Promise<void>;
  };
  if (pageWithInit.addInitScript) {
    await pageWithInit.addInitScript({
      content: `
(() => {
  const css = ${JSON.stringify(css)};
  const id = "dm-redaction-style";
  const install = () => {
    const parent = document.head || document.documentElement;
    if (!parent || document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    parent.appendChild(style);
  };
  install();
  document.addEventListener("DOMContentLoaded", install, { once: true });
})();
`,
    });
  }
  await page.addStyleTag({ content: css });
  logger.info(`Applied redaction to ${String(selectors.length)} selectors`);
}

export async function injectCursor(page: PlaywrightPage): Promise<void> {
  const css = getCursorCSS();
  await page.addStyleTag({ content: css });
  await page.evaluate((() => {
    if (!document.getElementById("dm-cursor")) {
      const cursor = document.createElement("div");
      cursor.id = "dm-cursor";
      cursor.style.left = "0px";
      cursor.style.top = "0px";
      document.body.appendChild(cursor);
    }
  }) as (...args: unknown[]) => unknown);
  logger.info("Injected cursor CSS and element");
}

export async function hideCursor(page: PlaywrightPage): Promise<void> {
  await page.evaluate((() => {
    const cursor = document.getElementById("dm-cursor");
    if (!cursor) return;
    cursor.style.opacity = "0";
    cursor.style.display = "none";
  }) as (...args: unknown[]) => unknown);
}

export async function checkSecrets(
  page: PlaywrightPage,
  patterns: string[],
  redactionSelectors: string[] = [],
): Promise<void> {
  if (patterns.length === 0) return;
  const text = (await page.evaluate(
    ((selectors: string[]) => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      for (const selector of selectors) {
        try {
          clone.querySelectorAll(selector).forEach((el) => el.remove());
        } catch {
          // Invalid selectors are rejected by mask generation; this keeps the scan best-effort.
        }
      }
      return clone.textContent ?? "";
    }) as (...args: unknown[]) => unknown,
    redactionSelectors as unknown,
  )) as string;
  const matches = scanForSecrets(text, patterns);
  for (const match of matches) {
    logger.warn(`Secret detected: pattern="${match.pattern}"`);
  }
}
