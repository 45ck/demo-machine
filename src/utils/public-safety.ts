function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export interface PublicSafetyPolicy {
  publicSafe: boolean;
  traceDisabled: boolean;
  traceEnabled: boolean;
  publishPassedRunsOnly: boolean;
}

export function getPublicSafetyPolicy(): PublicSafetyPolicy {
  const publicSafe = envFlag("DEMO_MACHINE_PUBLIC_SAFE");
  const traceDisabled = publicSafe || envFlag("DEMO_MACHINE_DISABLE_TRACE");
  return {
    publicSafe,
    traceDisabled,
    traceEnabled: !traceDisabled,
    publishPassedRunsOnly: true,
  };
}
