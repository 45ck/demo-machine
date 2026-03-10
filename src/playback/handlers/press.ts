import type { ActionHandler } from "../action-core.js";
import { buildEvent } from "../action-core.js";
import { selectorForEvent } from "../selector.js";
import { showKeyBadge } from "../visuals.js";

export const handlePress: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "press") return;

  await showKeyBadge(ctx.page, step.key);

  try {
    await ctx.page.keyboard.press(step.key);
  } catch (err) {
    throw new Error(
      `press action failed for key "${step.key}": ${err instanceof Error ? err.message : String(err)}. Valid key names: Enter, Escape, Tab, ArrowUp, ArrowDown, Control, Shift, Meta, etc.`,
      { cause: err },
    );
  }
  events.push(
    buildEvent({
      action: "press",
      startTime: start,
      selector: selectorForEvent(step),
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};
