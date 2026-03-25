import type { PlaybackContext } from "../action-core.js";
import type { PlaywrightPage } from "../playwright.js";
import type { BoundingBox } from "../types.js";
import {
  openClonedListbox,
  highlightClonedOption,
  openFakeDropdown,
  highlightFakeOption,
  closeSelectDropdown,
  readSelectOptions,
} from "../select-dropdown-visuals.js";

const MAX_VISIBLE_TRAVERSAL = 8;

type OptionSpec = { value?: string; label?: string; index?: number };

interface SelectParams {
  ctx: PlaybackContext;
  locator: ReturnType<PlaywrightPage["locator"]>;
  box: BoundingBox;
  optionSpec: OptionSpec;
  timeoutMs: number;
}

async function readSelectedText(
  locator: ReturnType<PlaywrightPage["locator"]>,
): Promise<string | null> {
  return (await locator.evaluate(((el: unknown) => {
    const sel = el as HTMLSelectElement;
    const opt = sel.selectedOptions[0];
    return opt ? (opt.textContent?.trim() ?? opt.value) : null;
  }) as (...args: unknown[]) => unknown)) as string | null;
}

/** Approach A: Clone real `<select>`, expand as listbox, cursor on real `<option>` elements. */
export async function selectApproachA(p: SelectParams): Promise<string | null> {
  const options = await readSelectOptions(p.ctx.page, p.box, p.optionSpec);
  const targetIdx = options.findIndex((o) => o.isTarget);

  if (targetIdx < 0) {
    await p.locator.selectOption(p.optionSpec, { timeout: p.timeoutMs });
    return readSelectedText(p.locator);
  }

  const optionBoxes = await openClonedListbox(p.ctx.page, p.box);

  const traverseDelay = Math.max(80, Math.floor(p.ctx.pacing.cursorDurationMs / 5));
  const selectedPause = Math.max(300, Math.floor(p.ctx.pacing.cursorDurationMs / 2));
  const startIdx = Math.max(0, targetIdx - MAX_VISIBLE_TRAVERSAL);

  try {
    for (let i = startIdx; i <= targetIdx; i++) {
      const isTarget = i === targetIdx;
      await highlightClonedOption(p.ctx.page, i, isTarget);
      const rowBox = optionBoxes[i];
      if (rowBox) await p.ctx.moveCursorTo(rowBox);
      await p.ctx.page.waitForTimeout(isTarget ? selectedPause : traverseDelay);
    }
  } finally {
    await closeSelectDropdown(p.ctx.page).catch(() => {});
  }

  await p.locator.selectOption(p.optionSpec, { timeout: p.timeoutMs });
  return readSelectedText(p.locator);
}

/** Approach B: Click to open native dropdown, keyboard navigate, Enter to select. */
export async function selectApproachB(p: SelectParams): Promise<string | null> {
  const options = await readSelectOptions(p.ctx.page, p.box, p.optionSpec);
  const targetIdx = options.findIndex((o) => o.isTarget);

  if (targetIdx < 0) {
    await p.locator.selectOption(p.optionSpec, { timeout: p.timeoutMs });
    return readSelectedText(p.locator);
  }

  const currentIdx = (await p.locator.evaluate(((el: unknown) => {
    return (el as HTMLSelectElement).selectedIndex;
  }) as (...args: unknown[]) => unknown)) as number;

  await p.locator.click({ timeout: p.timeoutMs });
  await p.ctx.page.waitForTimeout(300);

  const diff = targetIdx - currentIdx;
  const key = diff > 0 ? "ArrowDown" : "ArrowUp";
  const steps = Math.abs(diff);
  const keyDelay = Math.max(100, Math.floor(p.ctx.pacing.cursorDurationMs / 4));

  for (let i = 0; i < steps; i++) {
    await p.ctx.page.keyboard.press(key);
    await p.ctx.page.waitForTimeout(keyDelay);
  }

  await p.ctx.page.waitForTimeout(Math.max(300, Math.floor(p.ctx.pacing.cursorDurationMs / 2)));
  await p.ctx.page.keyboard.press("Enter");
  await p.ctx.page.waitForTimeout(200);

  return readSelectedText(p.locator);
}

/** Approach C: Polished fake overlay styled like Chrome's native dropdown. */
export async function selectApproachC(p: SelectParams): Promise<string | null> {
  const options = await readSelectOptions(p.ctx.page, p.box, p.optionSpec);
  const targetIdx = options.findIndex((o) => o.isTarget);

  if (targetIdx < 0) {
    await p.locator.selectOption(p.optionSpec, { timeout: p.timeoutMs });
    return readSelectedText(p.locator);
  }

  const optionBoxes = await openFakeDropdown(p.ctx.page, p.box, options);

  const traverseDelay = Math.max(80, Math.floor(p.ctx.pacing.cursorDurationMs / 5));
  const selectedPause = Math.max(300, Math.floor(p.ctx.pacing.cursorDurationMs / 2));
  const startIdx = Math.max(0, targetIdx - MAX_VISIBLE_TRAVERSAL);

  try {
    for (let i = startIdx; i <= targetIdx; i++) {
      const isTarget = i === targetIdx;
      await highlightFakeOption(p.ctx.page, i, isTarget);
      const rowBox = optionBoxes[i];
      if (rowBox) await p.ctx.moveCursorTo(rowBox);
      await p.ctx.page.waitForTimeout(isTarget ? selectedPause : traverseDelay);
    }
  } finally {
    await closeSelectDropdown(p.ctx.page).catch(() => {});
  }

  await p.locator.selectOption(p.optionSpec, { timeout: p.timeoutMs });
  return readSelectedText(p.locator);
}

// ---- Approach registry ----

export type SelectApproach = "A" | "B" | "C" | "D";

export type SelectApproachFn = (p: SelectParams) => Promise<string | null>;

let customSelectApproach: SelectApproachFn | null = null;

/** Register a custom select dropdown visual (approach D). */
export function registerCustomSelectApproach(fn: SelectApproachFn): void {
  customSelectApproach = fn;
}

/**
 * Pick the select approach based on DM_SELECT_APPROACH env var.
 *
 * - **C** (default) — Polished fake overlay styled like Chrome's native dropdown
 * - **A** — Clone real `<select>`, expand as listbox, cursor on real `<option>` elements
 * - **B** — Click-open native dropdown + keyboard navigation (opt-in, platform-dependent)
 * - **D** — Custom approach via `registerCustomSelectApproach()` (extensible hook)
 */
export function getSelectApproach(): SelectApproach {
  const env = process.env["DM_SELECT_APPROACH"]?.toUpperCase();
  if (env === "A" || env === "B" || env === "C" || env === "D") return env;
  return "C";
}

export function resolveApproachFn(approach: SelectApproach): SelectApproachFn {
  switch (approach) {
    case "A":
      return selectApproachA;
    case "B":
      return selectApproachB;
    case "D":
      return customSelectApproach ?? selectApproachC;
    case "C":
    default:
      return selectApproachC;
  }
}
