import type { ActionHandler } from "../action-core.js";
import {
  buildEvent,
  ensureTargetAttached,
  ensureTargetReady,
  stepTimeoutMs,
} from "../action-core.js";
import { resolveStepLocator } from "../selector.js";
import { flashSpotlight, pulseFocus, showFilePickerOverlay } from "../visuals.js";
import { getSelectApproach, resolveApproachFn } from "./select-approaches.js";
import { checkHitTest, checkPointerEvents, checkNetworkIdle } from "../guards.js";
import { checkActionability, checkSemanticFormTarget } from "../a11y-guards.js";
import { checkFilePickerOverlay, checkOverlayZIndex } from "../overlay-visual-guards.js";
import * as path from "node:path";

function shouldShowActionFocusVisuals(
  ctx: Parameters<ActionHandler>[0],
  step: Parameters<ActionHandler>[1],
  stepIndex: number,
): boolean {
  return ctx.shouldShowActionFocusVisuals?.(stepIndex, step) ?? true;
}

export const handleCheck: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "check") return;

  // Runtime guard — warn about pending network requests before action.
  await checkNetworkIdle(ctx.page);

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();

  // Runtime guards — warn but never block.
  if (step.selector) {
    await checkHitTest(ctx.page, box, step.selector, locator);
    await checkPointerEvents(ctx.page, step.selector, locator);
    await checkActionability(ctx.page, step.selector, "check");
    await checkSemanticFormTarget(ctx.page, step.selector, "check");
  }

  await ctx.moveCursorTo(box);
  if (shouldShowActionFocusVisuals(ctx, step, stepIndex)) {
    await flashSpotlight(ctx.page, box);
    await pulseFocus(ctx.page, box);
  }
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

  // Runtime guard — warn about pending network requests before action.
  await checkNetworkIdle(ctx.page);

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();

  // Runtime guards — warn but never block.
  if (step.selector) {
    await checkHitTest(ctx.page, box, step.selector, locator);
    await checkPointerEvents(ctx.page, step.selector, locator);
    await checkActionability(ctx.page, step.selector, "uncheck");
    await checkSemanticFormTarget(ctx.page, step.selector, "uncheck");
  }

  await ctx.moveCursorTo(box);
  if (shouldShowActionFocusVisuals(ctx, step, stepIndex)) {
    await flashSpotlight(ctx.page, box);
    await pulseFocus(ctx.page, box);
  }
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

  // Runtime guard — warn about pending network requests before action.
  await checkNetworkIdle(ctx.page);

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();

  // Runtime guards — warn but never block.
  if (step.selector) {
    await checkHitTest(ctx.page, box, step.selector, locator);
    await checkPointerEvents(ctx.page, step.selector, locator);
    await checkActionability(ctx.page, step.selector, "select");
    await checkSemanticFormTarget(ctx.page, step.selector, "select");
  }

  await ctx.moveCursorTo(box);
  if (shouldShowActionFocusVisuals(ctx, step, stepIndex)) {
    await flashSpotlight(ctx.page, box);
    await pulseFocus(ctx.page, box);
  }

  // Visual dropdown interaction — approach selected via DM_SELECT_APPROACH env var.
  let selectedText: string | null = null;
  if (box && ctx.pacing.cursorDurationMs > 0) {
    const fn = resolveApproachFn(getSelectApproach());
    selectedText = await fn({ ctx, locator, box, optionSpec: step.option, timeoutMs });
  } else {
    await locator.selectOption(step.option, { timeout: timeoutMs });
    selectedText = (await locator.evaluate(((el: unknown) => {
      const sel = el as HTMLSelectElement;
      const opt = sel.selectedOptions[0];
      return opt ? (opt.textContent?.trim() ?? opt.value) : null;
    }) as (...args: unknown[]) => unknown)) as string | null;
  }

  void selectedText;

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

  // Runtime guard — warn about pending network requests before action.
  await checkNetworkIdle(ctx.page);

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();

  // Runtime guards — warn but never block.
  if (step.selector) {
    await checkHitTest(ctx.page, box, step.selector, locator);
    await checkPointerEvents(ctx.page, step.selector, locator);
    await checkActionability(ctx.page, step.selector, "select");
    await checkSemanticFormTarget(ctx.page, step.selector, "select");
  }

  await ctx.moveCursorTo(box);
  if (shouldShowActionFocusVisuals(ctx, step, stepIndex)) {
    await flashSpotlight(ctx.page, box);
    await pulseFocus(ctx.page, box);
  }

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

  // Visual dropdown interaction — approach selected via DM_SELECT_APPROACH env var.
  let selectedText: string | null = null;
  if (box && ctx.pacing.cursorDurationMs > 0) {
    const fn = resolveApproachFn(getSelectApproach());
    selectedText = await fn({ ctx, locator, box, optionSpec: { value: firstValue }, timeoutMs });
  } else {
    await locator.selectOption({ value: firstValue }, { timeout: timeoutMs });
    selectedText = (await locator.evaluate(((el: unknown) => {
      const sel = el as HTMLSelectElement;
      const opt = sel.selectedOptions[0];
      return opt ? (opt.textContent?.trim() ?? opt.value) : null;
    }) as (...args: unknown[]) => unknown)) as string | null;
  }

  void selectedText;

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

  // Runtime guard — warn about pending network requests before action.
  await checkNetworkIdle(ctx.page);

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  await ensureTargetAttached(locator, timeoutMs);

  const raw = step.files ?? (step.file ? [step.file] : []);
  const base = ctx.specDir ?? process.cwd();
  const files = raw.map((p) => (path.isAbsolute(p) ? p : path.resolve(base, p)));

  const box = await locator.boundingBox();
  await ctx.moveCursorTo(box);
  if (shouldShowActionFocusVisuals(ctx, step, stepIndex)) {
    await flashSpotlight(ctx.page, box);
    await pulseFocus(ctx.page, box);
  }

  // Show a file-picker overlay so the viewer understands a file is being selected.
  const fileNames = files.map((f) => path.basename(f));
  await showFilePickerOverlay(ctx.page, fileNames);
  // Post-action visual guards (#5, #52) — verify overlay rendered correctly.
  await checkFilePickerOverlay(ctx.page, fileNames);
  await checkOverlayZIndex(ctx.page, "dm-file-picker");

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
