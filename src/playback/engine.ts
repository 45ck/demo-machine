import type { Chapter } from "../spec/types.js";
import { generateBlurStyles } from "../redaction/mask.js";
import { scanForSecrets } from "../redaction/secrets.js";
import { createLogger } from "../utils/logger.js";
import type { PlaywrightPage, PlaybackContext } from "./actions.js";
import { actionHandlers } from "./actions.js";
import { getCursorCSS } from "./cursor.js";
import type { ActionEvent, BoundingBox, Pacing, PlaybackOptions, PlaybackResult } from "./types.js";

const logger = createLogger("playback");

const NO_PACING: Pacing = {
  cursorDurationMs: 0,
  typeDelayMs: 0,
  postClickDelayMs: 0,
  postTypeDelayMs: 0,
  postNavigateDelayMs: 0,
  settleDelayMs: 0,
};

async function applyRedaction(page: PlaywrightPage, selectors: string[]): Promise<void> {
  if (selectors.length === 0) return;
  const css = generateBlurStyles(selectors);
  await page.addStyleTag({ content: css });
  logger.info(`Applied redaction to ${String(selectors.length)} selectors`);
}

async function injectCursor(page: PlaywrightPage): Promise<void> {
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

async function checkSecrets(page: PlaywrightPage, patterns: string[]): Promise<void> {
  if (patterns.length === 0) return;
  const text = (await page.evaluate(
    (() => document.body.innerText) as (...args: unknown[]) => unknown,
  )) as string;
  const matches = scanForSecrets(text, patterns);
  for (const match of matches) {
    logger.warn(`Secret detected: pattern="${match.pattern}" text="${match.text}"`);
  }
}

async function executeStep(
  ctx: PlaybackContext,
  step: Chapter["steps"][number],
  events: ActionEvent[],
  secretPatterns: string[],
): Promise<void> {
  const handler = actionHandlers[step.action];
  if (!handler) {
    throw new Error(`Unknown action: ${step.action}`);
  }
  await handler(ctx, step, events);
  if (step.action === "navigate") {
    await checkSecrets(ctx.page, secretPatterns);
  }
}

export class PlaybackEngine {
  private readonly page: PlaywrightPage;
  private readonly options: PlaybackOptions;
  private cursorPosition = { x: 0, y: 0 };

  constructor(page: PlaywrightPage, options: PlaybackOptions) {
    this.page = page;
    this.options = options;
  }

  private async moveCursorTo(box: BoundingBox | null): Promise<void> {
    if (!box) return;
    const pacing = this.options.pacing ?? NO_PACING;
    if (pacing.cursorDurationMs === 0) return;
    const targetX = box.x + box.width / 2;
    const targetY = box.y + box.height / 2;
    await this.page.evaluate(
      ((p: { fromX: number; fromY: number; toX: number; toY: number; durationMs: number }) => {
        let cursor = document.getElementById("dm-cursor");
        if (!cursor) {
          cursor = document.createElement("div");
          cursor.id = "dm-cursor";
          document.body.appendChild(cursor);
        }
        const startX = p.fromX;
        const startY = p.fromY;
        const endX = p.toX;
        const endY = p.toY;
        const duration = p.durationMs;
        const start = performance.now();

        function ease(t: number): number {
          const mt = 1 - t;
          return 3 * mt * mt * t * 0.42 + 3 * mt * t * t * 0.58 + t * t * t;
        }

        function animate(now: number): void {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = ease(progress);
          const x = startX + (endX - startX) * eased;
          const y = startY + (endY - startY) * eased;
          cursor!.style.left = x + "px";
          cursor!.style.top = y + "px";
          if (progress < 1) {
            requestAnimationFrame(animate);
          }
        }

        cursor.style.left = startX + "px";
        cursor.style.top = startY + "px";
        requestAnimationFrame(animate);
      }) as (...args: unknown[]) => unknown,
      {
        fromX: this.cursorPosition.x,
        fromY: this.cursorPosition.y,
        toX: targetX,
        toY: targetY,
        durationMs: pacing.cursorDurationMs,
      } as unknown,
    );
    await this.page.waitForTimeout(pacing.cursorDurationMs);
    this.cursorPosition = { x: targetX, y: targetY };
  }

  async execute(chapters: Chapter[]): Promise<PlaybackResult> {
    const events: ActionEvent[] = [];
    const startTime = Date.now();
    const pacing = this.options.pacing ?? NO_PACING;

    await applyRedaction(this.page, this.options.redactionSelectors ?? []);

    if (this.options.pacing) {
      await injectCursor(this.page);
    }

    const ctx: PlaybackContext = {
      page: this.page,
      pacing,
      moveCursorTo: (box) => this.moveCursorTo(box),
      reinjectCursor: () => (this.options.pacing ? injectCursor(this.page) : Promise.resolve()),
    };

    for (const chapter of chapters) {
      logger.info(`Starting chapter: ${chapter.title}`);
      for (const step of chapter.steps) {
        await executeStep(ctx, step, events, this.options.secretPatterns ?? []);
        if (this.options.onStepComplete && events.length > 0) {
          await this.options.onStepComplete(events[events.length - 1]!);
        }
        if (pacing.settleDelayMs > 0) {
          await this.page.waitForTimeout(pacing.settleDelayMs);
        }
      }
    }

    return {
      events,
      durationMs: Date.now() - startTime,
    };
  }
}
