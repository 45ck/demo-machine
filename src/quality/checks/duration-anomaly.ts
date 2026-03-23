import { postRenderPass, postRenderFail } from "../../validation/types.js";
import type { CheckResult } from "../../validation/types.js";
import type { QualityCheckContext } from "../types.js";

const CHECK_NAME = "duration:anomaly";
const ANOMALY_FACTOR = 2;
const MIN_HISTORY_SIZE = 2;

/** Compute the median of a sorted array of numbers. */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function checkDurationAnomalies(ctx: QualityCheckContext): CheckResult[] {
  const { events, timingHistory } = ctx;

  if (!events || events.length === 0) {
    return [{ ...postRenderPass(CHECK_NAME), message: "No events (skipped)" }];
  }

  if (!timingHistory) {
    return [{ ...postRenderPass(CHECK_NAME), message: "No timing history (skipped)" }];
  }

  const anomalies: CheckResult[] = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;
    const history = timingHistory[event.action];

    // Skip action types with no or insufficient history
    if (!history || history.length < MIN_HISTORY_SIZE) {
      continue;
    }

    const sorted = [...history].sort((a, b) => a - b);
    const med = median(sorted);
    if (med <= 0) continue; // no meaningful baseline
    const threshold = med * ANOMALY_FACTOR;

    if (event.duration > threshold) {
      anomalies.push(
        postRenderFail(
          CHECK_NAME,
          `Event ${i} ("${event.action}"): duration ${event.duration}ms exceeds 2x median (${med}ms, threshold ${threshold}ms)`,
          "This step may be flaky or the page was slow to respond",
        ),
      );
    }
  }

  return anomalies.length === 0 ? [postRenderPass(CHECK_NAME)] : anomalies;
}
