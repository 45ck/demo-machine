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

/** Return true if both steps target the same selector. */
function sameSelectorPair(a: ConflictStep, b: ConflictStep): boolean {
  const selA = getSelector(a);
  const selB = getSelector(b);
  return Boolean(selA && selB && selA === selB);
}

function prefix(chapterIndex: number, i: number): string {
  return `Chapter ${chapterIndex}, steps ${i}\u2192${i + 1}`;
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
      `${prefix(chapterIndex, i)}: "${next.action}" immediately after "navigate" \u2014 target may not exist on the new page`,
    );
  }
  return null;
}

/** Rule 2: check/uncheck toggle on same selector without assertion. */
function checkToggleConflict(
  curr: ConflictStep,
  next: ConflictStep,
  chapterIndex: number,
  i: number,
): CheckResult | null {
  if (isTogglePair(curr.action ?? "", next.action ?? "") && sameSelectorPair(curr, next)) {
    const sel = getSelector(curr);
    return warn(
      CHECK_NAME,
      `${prefix(chapterIndex, i)}: "${curr.action}" then "${next.action}" on same selector "${sel}" without intervening assertion`,
    );
  }
  return null;
}

/** Rule 3: duplicate select on same selector without assertion. */
function checkDuplicateSelect(
  curr: ConflictStep,
  next: ConflictStep,
  chapterIndex: number,
  i: number,
): CheckResult | null {
  if (curr.action === "select" && next.action === "select" && sameSelectorPair(curr, next)) {
    return warn(
      CHECK_NAME,
      `${prefix(chapterIndex, i)}: duplicate "select" on same selector "${getSelector(curr)}" without intervening assertion`,
    );
  }
  return null;
}

/** Rule 4: duplicate type on same selector without assertion. */
function checkDuplicateType(
  curr: ConflictStep,
  next: ConflictStep,
  chapterIndex: number,
  i: number,
): CheckResult | null {
  if (curr.action === "type" && next.action === "type" && sameSelectorPair(curr, next)) {
    return warn(
      CHECK_NAME,
      `${prefix(chapterIndex, i)}: duplicate "type" on same selector "${getSelector(curr)}" \u2014 may be redundant`,
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

const PAIR_RULES: PairRule[] = [
  checkNavigateThenInteract,
  checkToggleConflict,
  checkDuplicateSelect,
  checkDuplicateType,
];

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
