import type { ActionHandler } from "../action-core.js";
import { buildEvent, ensureTargetReady, stepTimeoutMs } from "../action-core.js";
import { resolveStepLocator } from "../selector.js";
import { getClickPulseScript } from "../cursor.js";
import { flashSpotlight, pulseFocus, spawnRipple } from "../visuals.js";
import type { BoundingBox } from "../types.js";
import type { PlaywrightLocator, PlaywrightPage } from "../playwright.js";

/**
 * `selectOptionInListbox` is for selecting an option inside a visible
 * inline listbox — typically a `<select multiple>` (or a single `<select>`
 * with `size > 1`) where the option rows are rendered in-place rather
 * than hidden behind a dropdown chevron.
 *
 * The existing `select` action assumes a closed dropdown that expands
 * when clicked, then overlays the options with a visual cursor traversal.
 * That model fights with libraries like react-dual-listbox, where the
 * `<select multiple>` is permanently expanded and the user simply clicks
 * one of the visible option rows.
 *
 * This handler:
 *   1. Resolves the parent `<select>` locator.
 *   2. Computes the bounding box of the matching `<option>` via page-side
 *      DOM evaluation (the host PlaywrightLocator interface doesn't expose
 *      child-locator construction, so we reach into the page).
 *   3. Moves the visible cursor overlay to that option's bounding box.
 *   4. Flashes the standard focus visuals.
 *   5. Calls `select.selectOption(...)` for reliable selection (browsers
 *      don't always fire change events for synthetic clicks on `<option>`;
 *      this path is dependable across platforms).
 *
 * The visible effect: cursor travels to the named option (e.g. "admin"),
 * the option highlights, the change event fires.
 */
interface OptionSpec {
  label?: string;
  value?: string;
  index?: number;
}

async function findOptionBox(
  page: PlaywrightPage,
  selectSelector: string,
  option: OptionSpec,
): Promise<BoundingBox | null> {
  return (await page.evaluate(
    ((args: unknown) => {
      const a = args as { sel: string; opt: { label?: string; value?: string; index?: number } };
      const select = document.querySelector(a.sel) as HTMLSelectElement;
      if (!select) return null;
      const options = Array.from(select.options);
      let target: HTMLOptionElement | null = null;
      if (a.opt.value !== undefined) {
        target = options.find((o) => o.value === a.opt.value) ?? null;
      } else if (a.opt.index !== undefined) {
        target = options[a.opt.index] ?? null;
      } else if (a.opt.label !== undefined) {
        target = options.find((o) => (o.textContent ?? "").trim() === a.opt.label) ?? null;
      }
      if (!target) return null;
      const rect = target.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }) as (...args: unknown[]) => unknown,
    { sel: selectSelector, opt: option } as unknown,
  )) as BoundingBox | null;
}

async function callSelectOption(
  locator: PlaywrightLocator,
  option: OptionSpec,
  timeoutMs: number,
): Promise<void> {
  const opts: { value?: string; label?: string; index?: number } = {};
  if (option.value !== undefined) opts.value = option.value;
  if (option.label !== undefined) opts.label = option.label;
  if (option.index !== undefined) opts.index = option.index;
  await locator.selectOption(opts, { timeout: timeoutMs });
}

export const handleSelectOptionInListbox: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "selectOptionInListbox") return;

  const timeoutMs = stepTimeoutMs(step);
  const resolved = resolveStepLocator(ctx.page, step);
  const selectLocator = resolved.locator;
  await ensureTargetReady(selectLocator, timeoutMs);

  const optionStep = step as unknown as { option: OptionSpec; selector?: string };
  if (!optionStep.selector) {
    throw new Error(
      'selectOptionInListbox requires a CSS "selector" (the parent <select>); structured targets are not yet supported.',
    );
  }

  const box = await findOptionBox(ctx.page, optionStep.selector, optionStep.option);
  if (!box) {
    throw new Error(
      `selectOptionInListbox: no option matching ${JSON.stringify(optionStep.option)} found in ${optionStep.selector}`,
    );
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

  await callSelectOption(selectLocator, optionStep.option, timeoutMs);

  events.push(
    buildEvent({
      action: "selectOptionInListbox",
      startTime: start,
      selector: resolved.selectorForEvent,
      boundingBox: box,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};
