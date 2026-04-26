import type { ActionHandler } from "../action-core.js";
import { buildEvent, ensureTargetReady, stepTimeoutMs } from "../action-core.js";
import { resolveStepLocator } from "../selector.js";
import { getClickPulseScript } from "../cursor.js";
import { flashSpotlight, pulseFocus, spawnRipple } from "../visuals.js";
import {
  checkHitTest,
  checkPointerEvents,
  checkBoundingBoxStability,
  checkNetworkIdle,
} from "../guards.js";
import { checkActionability } from "../a11y-guards.js";

export const handleClick: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "click") return;

  // Runtime guard — warn about pending network requests before action.
  await checkNetworkIdle(ctx.page);

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const locator = resolved.locator;

  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();

  // Runtime guards — warn but never block.
  await checkBoundingBoxStability(locator);
  if (step.selector) {
    await checkHitTest(ctx.page, box, step.selector, locator);
    await checkPointerEvents(ctx.page, step.selector, locator);
    await checkActionability(ctx.page, step.selector, "click");
  }

  await ctx.moveCursorTo(box);
  const showActionVisuals = ctx.shouldShowActionVisuals?.(stepIndex, step) ?? true;
  const showFocusVisuals =
    showActionVisuals && (ctx.shouldShowActionFocusVisuals?.(stepIndex, step) ?? true);
  if (showFocusVisuals) {
    await flashSpotlight(ctx.page, box);
    await pulseFocus(ctx.page, box);
  }
  if (showActionVisuals) {
    await ctx.page.evaluate(getClickPulseScript());
    await spawnRipple(ctx.page, box);
  }
  await locator.click({ timeout: timeoutMs });

  events.push(
    buildEvent({
      action: "click",
      startTime: start,
      selector: resolved.selectorForEvent,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};

export const handleClickFirstVisible: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "clickFirstVisible") return;

  // Runtime guard — warn about pending network requests before action.
  await checkNetworkIdle(ctx.page);

  const timeoutMs = stepTimeoutMs(step);
  const selector = `${step.selector}:visible`;
  const locator = ctx.page.locator(selector).nth(step.nth ?? 0);

  await ensureTargetReady(locator, timeoutMs);
  const box = await locator.boundingBox();

  // Runtime guards — warn but never block.
  await checkBoundingBoxStability(locator);
  if (step.selector) {
    await checkHitTest(ctx.page, box, step.selector, locator);
    await checkPointerEvents(ctx.page, step.selector, locator);
    await checkActionability(ctx.page, step.selector, "click");
  }

  await ctx.moveCursorTo(box);
  const showActionVisuals = ctx.shouldShowActionVisuals?.(stepIndex, step) ?? true;
  const showFocusVisuals =
    showActionVisuals && (ctx.shouldShowActionFocusVisuals?.(stepIndex, step) ?? true);
  if (showFocusVisuals) {
    await flashSpotlight(ctx.page, box);
    await pulseFocus(ctx.page, box);
  }
  if (showActionVisuals) {
    await ctx.page.evaluate(getClickPulseScript());
    await spawnRipple(ctx.page, box);
  }
  await locator.click({ timeout: timeoutMs });

  events.push(
    buildEvent({
      action: "clickFirstVisible",
      startTime: start,
      selector: `${selector}[nth=${step.nth ?? 0}]`,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};
