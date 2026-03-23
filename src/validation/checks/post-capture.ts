import * as fs from "node:fs";
import * as path from "node:path";
import { registerCheck } from "../registry.js";
import { pass, fail, warn } from "../types.js";
import type { CheckContext, CheckResult } from "../types.js";

/** Extended context for post-capture checks. */
export interface CaptureCheckContext extends CheckContext {
  events: Array<{ action: string; timestamp: number; duration: number }>;
  outputDir: string;
}

interface PostCaptureSpec {
  chapters?: Array<{ steps?: unknown[] }>;
}

type CaptureEvent = CaptureCheckContext["events"][number];

function isCaptureCtx(ctx: CheckContext): ctx is CaptureCheckContext {
  return "events" in ctx && "outputDir" in ctx;
}

function checkEventCount(
  events: CaptureEvent[],
  chapters: PostCaptureSpec["chapters"],
  results: CheckResult[],
): void {
  const name = "event-count";
  const expectedSteps = (chapters ?? []).reduce((sum, ch) => sum + (ch.steps ?? []).length, 0);
  if (events.length === expectedSteps) {
    results.push(pass(name));
  } else if (events.length < expectedSteps) {
    results.push(
      fail(
        name,
        `Expected ${expectedSteps} events but captured ${events.length} (missing ${expectedSteps - events.length})`,
        "Some steps may have failed silently",
      ),
    );
  } else {
    results.push(
      warn(name, `Captured ${events.length} events but spec has ${expectedSteps} steps`),
    );
  }
}

function checkMonotonicTimestamps(events: CaptureEvent[], results: CheckResult[]): void {
  const name = "monotonic-timestamps";
  for (let i = 1; i < events.length; i++) {
    if (events[i]!.timestamp < events[i - 1]!.timestamp) {
      results.push(
        fail(
          name,
          `Event ${i} timestamp (${events[i]!.timestamp}) is before event ${i - 1} (${events[i - 1]!.timestamp})`,
        ),
      );
      return;
    }
  }
  results.push(pass(name));
}

function checkNegativeDurations(events: CaptureEvent[], results: CheckResult[]): void {
  const name = "negative-durations";
  let found = false;
  for (let i = 0; i < events.length; i++) {
    if (events[i]!.duration < 0) {
      found = true;
      results.push(
        fail(
          name,
          `Event ${i} ("${events[i]!.action}") has negative duration: ${events[i]!.duration}ms`,
        ),
      );
    }
  }
  if (!found) {
    results.push(pass(name));
  }
}

function checkVideoFile(outputDir: string, results: CheckResult[]): void {
  const name = "video-file";
  const videoPath = path.join(outputDir, "video.webm");
  if (!fs.existsSync(videoPath)) {
    results.push(
      fail(name, `Video file not found at ${videoPath}`, "Check capture output directory"),
    );
    return;
  }
  const stats = fs.statSync(videoPath);
  results.push(
    stats.size > 0 ? pass(name) : fail(name, "Video file exists but is empty (0 bytes)"),
  );
}

function checkArtifacts(outputDir: string, results: CheckResult[]): void {
  for (const artifact of ["events.json", "trace.zip"]) {
    const artifactPath = path.join(outputDir, artifact);
    if (fs.existsSync(artifactPath)) {
      results.push(pass(`artifact:${artifact}`));
    } else {
      results.push(warn(`artifact:${artifact}`, `Expected artifact not found: ${artifact}`));
    }
  }
}

function postCaptureCheck(ctx: CheckContext): CheckResult[] {
  if (!isCaptureCtx(ctx)) {
    return [];
  }

  const results: CheckResult[] = [];
  const spec = ctx.spec as PostCaptureSpec;
  const { events, outputDir } = ctx;

  checkEventCount(events, spec.chapters, results);
  checkMonotonicTimestamps(events, results);
  checkNegativeDurations(events, results);
  checkVideoFile(outputDir, results);
  checkArtifacts(outputDir, results);

  return results;
}

registerCheck({
  name: "post-capture",
  phase: "post-capture",
  fn: postCaptureCheck,
});
