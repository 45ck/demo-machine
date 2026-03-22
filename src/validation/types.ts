/** Validation check phase. */
export type CheckPhase = "pre-capture" | "post-capture";

/** Check severity level. */
export type CheckSeverity = "pass" | "fail" | "warn";

/** Result of a validation check. */
export interface CheckResult {
  phase: CheckPhase;
  checkName: string;
  status: CheckSeverity;
  message: string;
  suggestion?: string;
}

/** Context for pre-capture checks. */
export interface CheckContext {
  spec: unknown;
  specDir: string;
  options?: Record<string, unknown>;
}

/** Function signature for a validation check. */
export type CheckFn = (ctx: CheckContext) => CheckResult | CheckResult[];

/** Definition of a validation check. */
export interface CheckDefinition {
  name: string;
  phase: CheckPhase;
  fn: CheckFn;
}

export function pass(name: string): CheckResult {
  return { phase: "pre-capture", checkName: name, status: "pass", message: "OK" };
}

export function fail(name: string, message: string, suggestion?: string): CheckResult {
  return { phase: "pre-capture", checkName: name, status: "fail", message, suggestion };
}

export function warn(name: string, message: string): CheckResult {
  return { phase: "pre-capture", checkName: name, status: "warn", message };
}
