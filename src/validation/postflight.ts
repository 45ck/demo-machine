import type { CheckResult, CheckContext } from "./types.js";
import type { MonitorIssue } from "./monitor-types.js";
import { runPhase } from "./registry.js";
import "./checks/post-capture.js";

interface PostflightContext extends CheckContext {
  events: unknown[];
  outputDir: string;
}

export async function postflight(
  ctx: PostflightContext,
  monitorIssues?: MonitorIssue[],
): Promise<CheckResult[]> {
  const results = await Promise.resolve(runPhase("post-capture", ctx));
  if (monitorIssues) {
    for (const issue of monitorIssues) {
      results.push({
        phase: "post-capture",
        checkName: `monitor:${issue.monitor}`,
        status: issue.severity === "error" ? "fail" : "warn",
        message: issue.message,
      });
    }
  }
  return results;
}
