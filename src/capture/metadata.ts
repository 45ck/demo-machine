import { readFile, writeFile } from "node:fs/promises";

export interface CaptureMetadataV1 {
  schemaVersion: 1;
  startTimestamp: number;
  createdAt: string;
  specTitle?: string;
}

export type CaptureMetadata = CaptureMetadataV1;

export async function writeCaptureMetadata(
  meta: CaptureMetadata,
  outputPath: string,
): Promise<void> {
  const json = JSON.stringify(meta, null, 2) + "\n";
  await writeFile(outputPath, json, "utf-8");
}

async function readCaptureMetadata(path: string): Promise<CaptureMetadata> {
  const raw = await readFile(path, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Capture metadata must be a JSON object");
  }

  const record = parsed as Record<string, unknown>;
  if (record["schemaVersion"] !== 1) {
    throw new Error("Unsupported capture metadata schemaVersion");
  }
  if (typeof record["startTimestamp"] !== "number") {
    throw new Error("Capture metadata missing numeric startTimestamp");
  }
  if (typeof record["createdAt"] !== "string") {
    throw new Error("Capture metadata missing string createdAt");
  }

  const specTitle = typeof record["specTitle"] === "string" ? record["specTitle"] : undefined;

  return {
    schemaVersion: 1,
    startTimestamp: record["startTimestamp"],
    createdAt: record["createdAt"],
    ...(specTitle ? { specTitle } : {}),
  };
}

// Best-effort reader for environments/tests where metadata may not exist or may not be valid.
export async function readCaptureMetadataMaybe(path: string): Promise<CaptureMetadata | undefined> {
  try {
    return await readCaptureMetadata(path);
  } catch {
    return undefined;
  }
}
