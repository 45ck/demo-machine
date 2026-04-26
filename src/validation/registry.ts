import type { CheckDefinition, CheckPhase, CheckResult, CheckContext } from "./types.js";

const checks: CheckDefinition[] = [];

export function registerCheck(def: CheckDefinition): void {
  checks.push(def);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message.length > 0) return err.message;
  if (typeof err === "string" && err.length > 0) return err;
  return String(err);
}

export async function runPhase(phase: CheckPhase, ctx: CheckContext): Promise<CheckResult[]> {
  const phaseChecks = checks.filter((c) => c.phase === phase);
  const settled = await Promise.allSettled(
    phaseChecks.map(async (c) => {
      const result = await c.fn(ctx);
      return Array.isArray(result) ? result : [result];
    }),
  );
  return settled.flatMap((s, index) => {
    if (s.status === "fulfilled") return s.value;
    const check = phaseChecks[index];
    const checkName = check?.name ?? "unknown-check";
    return [
      {
        phase,
        checkName,
        status: "fail",
        message: `Validation check "${checkName}" failed: ${errorMessage(s.reason)}`,
      },
    ];
  });
}
