import type { MonitorIssue } from "../validation/monitor-types.js";
import { postflight } from "../validation/postflight.js";

/** Run postflight checks after capture completes. */
export async function runPostflight(
  spec: unknown,
  specDir: string,
  events: unknown[],
  outputDir: string,
  monitorIssues?: MonitorIssue[],
): Promise<void> {
  const results = await postflight(
    { spec, specDir, events, outputDir },
    monitorIssues,
  );
  const failures = results.filter((r) => r.status === "fail");
  if (failures.length > 0) {
    const msgs = failures.map((f) => `  ✗ [${f.checkName}] ${f.message}`).join("\n");
    console.warn(`Postflight warnings:\n${msgs}`);
  }
}
