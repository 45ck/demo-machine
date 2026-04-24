import { registerCheck } from "../registry.js";
import { pass, warn } from "../types.js";
import type { CheckContext, CheckResult } from "../types.js";

const CHECK_NAME = "action-conflicts";

/** Actions that interact with elements on the current page. */
const INTERACTION_ACTIONS = new Set([
  "click",
  "clickFirstVisible",
  "type",
  "select",
  "selectFirstNonPlaceholder",
  "check",
  "uncheck",
  "hover",
  "upload",
]);

interface ConflictStep {
  action?: string;
  selector?: string;
  target?: unknown;
}

interface ConflictSpecShape {
  chapters?: Array<{ steps?: ConflictStep[] }>;
}

/** Extract a comparable selector string from a step. */
function getSelector(step: ConflictStep): string | undefined {
  if (typeof step.selector === "string") return step.selector;
  if (step.target && typeof step.target === "object") {
    return JSON.stringify(step.target);
  }
  return undefined;
}

function isTogglePair(a: string, b: string): boolean {
  return (a === "check" && b === "uncheck") || (a === "uncheck" && b === "check");
}

function prefix(chapterIndex: number, fromIndex: number, toIndex: number): string {
  return `Chapter ${chapterIndex}, steps ${fromIndex}\u2192${toIndex}`;
}

/** Rule 1: navigate immediately followed by a page-interaction action. */
function checkNavigateThenInteract(
  curr: ConflictStep,
  next: ConflictStep,
  chapterIndex: number,
  i: number,
): CheckResult | null {
  if (curr.action === "navigate" && INTERACTION_ACTIONS.has(next.action ?? "")) {
    return warn(
      CHECK_NAME,
      `${prefix(chapterIndex, i, i + 1)}: "${next.action}" immediately after "navigate" \u2014 target may not exist on the new page`,
    );
  }
  return null;
}

type PairRule = (
  curr: ConflictStep,
  next: ConflictStep,
  chapterIndex: number,
  i: number,
) => CheckResult | null;

const PAIR_RULES: PairRule[] = [checkNavigateThenInteract];

interface PendingElementAction {
  action: string;
  stepIndex: number;
}

const SEQUENCE_ACTIONS = new Set(["check", "uncheck", "select", "type"]);

interface SequenceWarningInput {
  previous: PendingElementAction;
  action: string;
  selector: string;
  chapterIndex: number;
  stepIndex: number;
}

function buildSequenceWarning(input: SequenceWarningInput): CheckResult | null {
  if (isTogglePair(input.previous.action, input.action)) {
    return warn(
      CHECK_NAME,
      `${prefix(input.chapterIndex, input.previous.stepIndex, input.stepIndex)}: "${input.previous.action}" then "${input.action}" on same selector "${input.selector}" without intervening assertion`,
    );
  }

  if (input.previous.action === "select" && input.action === "select") {
    return warn(
      CHECK_NAME,
      `${prefix(input.chapterIndex, input.previous.stepIndex, input.stepIndex)}: duplicate "select" on same selector "${input.selector}" without intervening assertion`,
    );
  }

  if (input.previous.action === "type" && input.action === "type") {
    return warn(
      CHECK_NAME,
      `${prefix(input.chapterIndex, input.previous.stepIndex, input.stepIndex)}: duplicate "type" on same selector "${input.selector}" \u2014 may be redundant`,
    );
  }

  return null;
}

function trackElementAction(params: {
  pendingBySelector: Map<string, PendingElementAction>;
  step: ConflictStep;
  selector: string;
  chapterIndex: number;
  stepIndex: number;
  results: CheckResult[];
}): void {
  const action = params.step.action ?? "";
  if (!SEQUENCE_ACTIONS.has(action)) return;

  const previous = params.pendingBySelector.get(params.selector);
  if (previous) {
    const warning = buildSequenceWarning({
      previous,
      action,
      selector: params.selector,
      chapterIndex: params.chapterIndex,
      stepIndex: params.stepIndex,
    });
    if (warning) params.results.push(warning);
  }

  params.pendingBySelector.set(params.selector, {
    action,
    stepIndex: params.stepIndex,
  });
}

function checkElementActionSequence(
  steps: ConflictStep[],
  chapterIndex: number,
  results: CheckResult[],
): void {
  const pendingBySelector = new Map<string, PendingElementAction>();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const selector = getSelector(step);

    if (step.action === "navigate") {
      pendingBySelector.clear();
      continue;
    }

    if (step.action === "assert") {
      if (selector) pendingBySelector.delete(selector);
      continue;
    }

    if (!selector) continue;
    trackElementAction({
      pendingBySelector,
      step,
      selector,
      chapterIndex,
      stepIndex: i,
      results,
    });
  }
}

function checkChapterConflicts(
  steps: ConflictStep[],
  chapterIndex: number,
  results: CheckResult[],
): void {
  for (let i = 0; i < steps.length - 1; i++) {
    const curr = steps[i]!;
    const next = steps[i + 1]!;

    for (const rule of PAIR_RULES) {
      const result = rule(curr, next, chapterIndex, i);
      if (result) {
        results.push(result);
        break;
      }
    }
  }
  checkElementActionSequence(steps, chapterIndex, results);
}

function checkActionConflicts(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const spec = ctx.spec as ConflictSpecShape;
  const chapters = spec.chapters ?? [];

  for (let chIdx = 0; chIdx < chapters.length; chIdx++) {
    const steps = chapters[chIdx]!.steps ?? [];
    checkChapterConflicts(steps, chIdx, results);
  }

  return results.length === 0 ? [pass(CHECK_NAME)] : results;
}

registerCheck({
  name: CHECK_NAME,
  phase: "pre-capture",
  fn: checkActionConflicts,
});
