import { generateBlurStyles } from "../redaction/mask.js";
import { scanForSecrets } from "../redaction/secrets.js";
import { createLogger } from "../utils/logger.js";
import type { PlaywrightPage } from "./actions.js";
import { getCursorCSS } from "./cursor.js";

const logger = createLogger("playback");

export async function applyRedaction(page: PlaywrightPage, selectors: string[]): Promise<void> {
  if (selectors.length === 0) return;
  const css = generateBlurStyles(selectors);
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

export async function checkSecrets(page: PlaywrightPage, patterns: string[]): Promise<void> {
  if (patterns.length === 0) return;
  const text = (await page.evaluate(
    (() => document.body.innerText) as (...args: unknown[]) => unknown,
  )) as string;
  const matches = scanForSecrets(text, patterns);
  for (const match of matches) {
    logger.warn(`Secret detected: pattern="${match.pattern}" text="${match.text}"`);
  }
}
