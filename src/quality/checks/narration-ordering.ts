import { postRenderPass, postRenderFail, postRenderWarn } from "../../validation/types.js";
import type { CheckResult } from "../../validation/types.js";
import type { QualityCheckContext } from "../types.js";

const CHECK_NAME = "narration:temporal-ordering";

/** Compare narration segments against events and collect violations. */
function collectViolations(
  segments: NonNullable<QualityCheckContext["narrationSegments"]>,
  events: NonNullable<QualityCheckContext["events"]>,
): { violations: string[]; skippedCount: number } {
  const violations: string[] = [];
  let skippedCount = 0;

  for (const segment of segments) {
    const event = events[segment.actionIndex];
    if (!event) {
      skippedCount++;
      continue;
    }
    if (segment.startMs > event.timestamp) {
      const deltaMs = segment.startMs - event.timestamp;
      violations.push(
        `step ${segment.actionIndex}: narration starts ${deltaMs}ms after action ` +
          `(narration=${segment.startMs}ms, action=${event.timestamp}ms, "${segment.text}")`,
      );
    }
  }
  return { violations, skippedCount };
}

export function checkNarrationOrdering(ctx: QualityCheckContext): CheckResult[] {
  if (!ctx.narrationSegments || ctx.narrationSegments.length === 0) {
    return [{ ...postRenderPass(CHECK_NAME), message: "No narration segments (skipped)" }];
  }
  if (!ctx.events || ctx.events.length === 0) {
    return [{ ...postRenderPass(CHECK_NAME), message: "No events (skipped)" }];
  }

  const { violations, skippedCount } = collectViolations(ctx.narrationSegments, ctx.events);
  const results: CheckResult[] = [];

  if (skippedCount > 0) {
    results.push(
      postRenderWarn(
        CHECK_NAME,
        `${skippedCount} narration segment(s) had no matching event (actionIndex out of bounds)`,
      ),
    );
  }

  if (violations.length > 0) {
    results.push(
      postRenderFail(
        CHECK_NAME,
        `Narration plays after action in ${violations.length} segment(s): ${violations.join("; ")}`,
        "Review narration timing — consider increasing inter-step delays or reducing narration length",
      ),
    );
  }

  return results.length === 0 ? [postRenderPass(CHECK_NAME)] : results;
}
