import type { CheckDefinition, CheckPhase, CheckResult, CheckContext } from "./types.js";

const checks: CheckDefinition[] = [];

export function registerCheck(def: CheckDefinition): void {
  checks.push(def);
}

export async function runPhase(phase: CheckPhase, ctx: CheckContext): Promise<CheckResult[]> {
  const phaseChecks = checks.filter((c) => c.phase === phase);
  const settled = await Promise.allSettled(
    phaseChecks.map((c) =>
      Promise.resolve().then(() => {
        const result = c.fn(ctx);
        return Array.isArray(result) ? result : [result];
      }),
    ),
  );
  return settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
}
