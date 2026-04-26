import type { Step } from "../spec/types.js";
import { createLogger } from "../utils/logger.js";
import { ensureTargetReady, stepTimeoutMs } from "./action-core.js";
import type { PlaywrightLocator, PlaywrightPage } from "./playwright.js";
import { resolveLocatorFromInput, resolveStepLocator, type Target } from "./selector.js";
import type { BoundingBox, NarrationFocusConfig } from "./types.js";
import { clearNarrationFocus, showNarrationFocus } from "./visuals.js";

const log = createLogger("playback:narration-focus");
const PRESENTATION_TIMEOUT_MS = 1500;

type FocusOverride = Partial<NarrationFocusConfig> & {
  selector?: string;
  target?: Target;
  nth?: number;
};

interface PreparedNarrationFocus {
  mappedBox: BoundingBox;
  focus: NarrationFocusConfig;
  canShowActionPulse: boolean;
}

function focusOverride(step: Step): FocusOverride | undefined {
  const raw = (step as unknown as { focus?: unknown }).focus;
  if (!raw || typeof raw !== "object") return undefined;
  return raw as FocusOverride;
}

function mergeFocusConfig(
  base: NarrationFocusConfig,
  override: FocusOverride | undefined,
): NarrationFocusConfig {
  if (!override) return base;
  return {
    enabled: override.enabled ?? base.enabled,
    cursor: override.cursor ?? base.cursor,
    highlight: override.highlight ?? base.highlight,
    zoom: override.zoom ?? base.zoom,
    scale: override.scale ?? base.scale,
    durationMs: override.durationMs ?? base.durationMs,
    transitionMs: override.transitionMs ?? base.transitionMs,
  };
}

function dragEndpoint(step: Step): { selector?: string; target?: Target; nth?: number } | null {
  if (step.action !== "dragAndDrop") return null;
  const endpoint: { selector?: string; target?: Target; nth?: number } = {};
  if (step.to.selector !== undefined) endpoint.selector = step.to.selector;
  if (step.to.target !== undefined) endpoint.target = step.to.target as Target;
  if (step.to.nth !== undefined) endpoint.nth = step.to.nth;
  return endpoint;
}

function locatorForNarrationFocus(
  page: PlaywrightPage,
  step: Step,
  focus?: FocusOverride,
): { locator: PlaywrightLocator; selectorForEvent: string } | null {
  if (focus?.selector || focus?.target) {
    const input: { selector?: string; target?: Target; nth?: number } = {};
    if (focus.selector !== undefined) input.selector = focus.selector;
    if (focus.target !== undefined) input.target = focus.target;
    if (focus.nth !== undefined) input.nth = focus.nth;
    return resolveLocatorFromInput(page, input, `Step "${step.action}" focus target`);
  }

  if (step.action === "clickFirstVisible") {
    return {
      locator: page.locator(`${step.selector}:visible`).nth(step.nth ?? 0),
      selectorForEvent: `${step.selector}:visible`,
    };
  }

  const endpoint = dragEndpoint(step);
  if (endpoint) {
    return resolveLocatorFromInput(page, endpoint, `Step "${step.action}" focus target`);
  }

  try {
    return resolveStepLocator(page, step);
  } catch {
    return null;
  }
}

function shouldPrepareFocus(step: Step, focus: NarrationFocusConfig): boolean {
  return Boolean(
    step.narration && focus.enabled && (focus.cursor || focus.highlight || focus.zoom),
  );
}

async function applyNarrationFocus(params: {
  page: PlaywrightPage;
  box: BoundingBox;
  focus: NarrationFocusConfig;
  moveCursorTo(box: BoundingBox | null): Promise<void>;
}): Promise<BoundingBox> {
  let mappedBox = params.box;
  if (params.focus.highlight || params.focus.zoom) {
    mappedBox = await showNarrationFocus(params.page, params.box, params.focus);
  }
  if (params.focus.cursor) {
    await params.moveCursorTo(params.focus.zoom ? params.box : mappedBox);
  }
  return mappedBox;
}

function canShowActionPulse(step: Step): boolean {
  return (
    step.action === "click" ||
    step.action === "clickFirstVisible" ||
    step.action === "check" ||
    step.action === "uncheck" ||
    step.action === "select" ||
    step.action === "selectFirstNonPlaceholder" ||
    step.action === "type" ||
    step.action === "hover"
  );
}

export async function prepareNarrationFocus(params: {
  page: PlaywrightPage;
  step: Step;
  focus: NarrationFocusConfig;
  moveCursorTo(box: BoundingBox | null): Promise<void>;
}): Promise<PreparedNarrationFocus | undefined> {
  const focus = mergeFocusConfig(params.focus, focusOverride(params.step));
  if (!shouldPrepareFocus(params.step, focus)) return undefined;

  const resolved = locatorForNarrationFocus(params.page, params.step, focusOverride(params.step));
  if (!resolved) return undefined;

  try {
    const timeoutMs = Math.min(stepTimeoutMs(params.step), PRESENTATION_TIMEOUT_MS);
    await ensureTargetReady(resolved.locator, timeoutMs);
    const box = await resolved.locator.boundingBox();
    if (!box) return undefined;

    const mappedBox = await applyNarrationFocus({ ...params, box, focus });
    return { mappedBox, focus, canShowActionPulse: canShowActionPulse(params.step) };
  } catch (err) {
    log.debug(
      `Skipped narration focus for ${resolved.selectorForEvent}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return undefined;
  }
}

export async function resetNarrationFocus(page: PlaywrightPage): Promise<void> {
  await clearNarrationFocus(page);
}
