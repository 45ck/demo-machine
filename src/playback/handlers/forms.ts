import type { ActionHandler } from "../action-core.js";
import {
  buildEvent,
  ensureTargetAttached,
  ensureTargetReady,
  stepTimeoutMs,
} from "../action-core.js";
import { resolveStepLocator } from "../selector.js";
import { flashSpotlight, pulseFocus } from "../visuals.js";
import * as path from "node:path";

export const handleCheck: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "check") return;

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();
  await ctx.moveCursorTo(box);
  await flashSpotlight(ctx.page, box);
  await pulseFocus(ctx.page, box);
  await locator.setChecked(true, { timeout: timeoutMs });

  events.push(
    buildEvent({
      action: "check",
      startTime: start,
      selector: resolved.selectorForEvent,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};

export const handleUncheck: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "uncheck") return;

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();
  await ctx.moveCursorTo(box);
  await flashSpotlight(ctx.page, box);
  await pulseFocus(ctx.page, box);
  await locator.setChecked(false, { timeout: timeoutMs });

  events.push(
    buildEvent({
      action: "uncheck",
      startTime: start,
      selector: resolved.selectorForEvent,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};

export const handleSelect: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "select") return;

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();
  await ctx.moveCursorTo(box);
  await flashSpotlight(ctx.page, box);
  await pulseFocus(ctx.page, box);
  await locator.selectOption(step.option, { timeout: timeoutMs });

  events.push(
    buildEvent({
      action: "select",
      startTime: start,
      selector: resolved.selectorForEvent,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};

export const handleSelectFirstNonPlaceholder: ActionHandler = async (
  ctx,
  step,
  events,
  stepIndex,
) => {
  const start = Date.now();
  if (step.action !== "selectFirstNonPlaceholder") return;

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();
  await ctx.moveCursorTo(box);
  await flashSpotlight(ctx.page, box);
  await pulseFocus(ctx.page, box);

  const firstValue = (await locator.evaluate(((el: unknown) => {
    const select = el as HTMLSelectElement;
    const placeholderLike = /^(select|choose|all|none)\b/i;
    for (const option of Array.from(select.options)) {
      const value = option.value?.trim() ?? "";
      const text = option.textContent?.trim() ?? "";
      if (option.disabled) continue;
      if (value.length === 0) continue;
      if (text.length === 0) continue;
      if (placeholderLike.test(text)) continue;
      return value;
    }
    return null;
  }) as (...args: unknown[]) => unknown)) as string | null;

  if (!firstValue) {
    throw new Error(
      `No non-placeholder option found for ${resolved.selectorForEvent}. Add a concrete option or use "select".`,
    );
  }

  await locator.selectOption({ value: firstValue }, { timeout: timeoutMs });

  events.push(
    buildEvent({
      action: "selectFirstNonPlaceholder",
      startTime: start,
      selector: resolved.selectorForEvent,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};

export const handleUpload: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "upload") return;

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  await ensureTargetAttached(locator, timeoutMs);

  const raw = step.files ?? (step.file ? [step.file] : []);
  const base = ctx.specDir ?? process.cwd();
  const files = raw.map((p) => (path.isAbsolute(p) ? p : path.resolve(base, p)));

  const box = await locator.boundingBox();
  await ctx.moveCursorTo(box);
  await flashSpotlight(ctx.page, box);
  await pulseFocus(ctx.page, box);
  try {
    await locator.setInputFiles(files, { timeout: timeoutMs });
  } catch (err) {
    const detail = files.length === 1 ? `"${files[0]}"` : `${String(files.length)} files`;
    throw new Error(
      `upload failed for ${detail} on ${resolved.selectorForEvent}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  events.push(
    buildEvent({
      action: "upload",
      startTime: start,
      selector: resolved.selectorForEvent,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};
