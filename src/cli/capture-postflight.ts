import type { MonitorIssue } from "../validation/monitor-types.js";
import { postflight } from "../validation/postflight.js";

interface PostflightParams {
  captureResult?: unknown;
  spec?: unknown;
  specDir?: string | undefined;
  specPath?: string | undefined;
  events?: unknown[];
  startTimestamp?: number;
  monitorIssues?: MonitorIssue[];
  opts?: { output?: string | undefined } | undefined;
  [key: string]: unknown;
}

/** Run postflight checks after capture completes. */
export async function runPostflight(params: PostflightParams): Promise<void> {
  const outputDir = (params.opts?.output as string) ?? ".";
  const specDir = params.specDir ?? ".";
  const results = await postflight(
    { spec: params.spec, specDir, events: params.events ?? [], outputDir },
    params.monitorIssues,
  );
  const failures = results.filter((r) => r.status === "fail");
  if (failures.length > 0) {
    const msgs = failures.map((f) => `  - [${f.checkName}] ${f.message}`).join("\n");
    throw new Error(`Postflight verification failed:\n${msgs}`);
  }
}
