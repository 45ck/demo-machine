import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
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

interface PostflightFailure {
  checkName: string;
  status: "fail";
  message: string;
}

interface VerificationJson {
  status?: unknown;
  artifacts?: Record<string, unknown>;
  checks?: {
    requiredArtifactsPresent?: unknown;
    missingRequiredArtifacts?: unknown;
    publicSafeArtifactsClean?: unknown;
    forbiddenPublicArtifacts?: unknown;
    failureArtifactsPresent?: unknown;
    missingFailureArtifacts?: unknown;
  };
}

const PASSED_REQUIRED_ARTIFACT_KEYS = [
  "videoPath",
  "eventLogPath",
  "metadataPath",
  "environmentPath",
] as const;

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function formatJsonList(value: unknown): string {
  return Array.isArray(value) && value.length > 0
    ? ` (${value.map((item) => String(item)).join(", ")})`
    : "";
}

async function verifyArtifactContract(outputDir: string): Promise<PostflightFailure[]> {
  const verificationPath = join(outputDir, "verification.json");
  let parsed: VerificationJson;

  try {
    parsed = JSON.parse(await readFile(verificationPath, "utf-8")) as VerificationJson;
  } catch (err) {
    return [
      {
        checkName: "artifact:verification.json",
        status: "fail",
        message: `verification.json not readable at ${verificationPath}: ${String(err)}`,
      },
    ];
  }

  const failures: PostflightFailure[] = [];
  if (parsed.status !== "passed") {
    failures.push({
      checkName: "artifact:verification-status",
      status: "fail",
      message: `Expected verification status "passed" but found ${String(parsed.status)}`,
    });
  }

  if (parsed.checks?.requiredArtifactsPresent !== true) {
    failures.push({
      checkName: "artifact:required-artifacts",
      status: "fail",
      message: `verification.json reports requiredArtifactsPresent=${String(
        parsed.checks?.requiredArtifactsPresent,
      )}${formatJsonList(parsed.checks?.missingRequiredArtifacts)}`,
    });
  }

  if (parsed.checks?.publicSafeArtifactsClean === false) {
    failures.push({
      checkName: "artifact:public-safe",
      status: "fail",
      message: `verification.json reports forbidden public artifacts${formatJsonList(
        parsed.checks.forbiddenPublicArtifacts,
      )}`,
    });
  }

  for (const artifactKey of PASSED_REQUIRED_ARTIFACT_KEYS) {
    const artifactPath = parsed.artifacts?.[artifactKey];
    if (typeof artifactPath !== "string" || artifactPath.length === 0) {
      failures.push({
        checkName: `artifact:${artifactKey}`,
        status: "fail",
        message: `verification.json is missing required artifact path ${artifactKey}`,
      });
      continue;
    }
    if (!(await isFile(artifactPath))) {
      failures.push({
        checkName: `artifact:${artifactKey}`,
        status: "fail",
        message: `Required capture artifact ${artifactKey} not found on disk at ${artifactPath}`,
      });
    }
  }

  return failures;
}

/** Run postflight checks after capture completes. */
export async function runPostflight(params: PostflightParams): Promise<void> {
  const outputDir = (params.opts?.output as string) ?? ".";
  const specDir = params.specDir ?? ".";
  const results = await postflight(
    { spec: params.spec, specDir, events: params.events ?? [], outputDir },
    params.monitorIssues,
  );
  const artifactFailures = await verifyArtifactContract(outputDir);
  const failures = [...results.filter((r) => r.status === "fail"), ...artifactFailures];
  if (failures.length > 0) {
    const msgs = failures.map((f) => `  - [${f.checkName}] ${f.message}`).join("\n");
    throw new Error(`Postflight verification failed:\n${msgs}`);
  }
}
