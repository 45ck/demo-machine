import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type JsonObject = Record<string, unknown>;

export interface DemoCaptureEvidenceParams {
  outputDir: string;
  videoPath: string;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return null;
  }
}

async function writeJson(path: string, value: unknown): Promise<string> {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
  return path;
}

function eventTimestampSeconds(events: JsonObject[], index: unknown): number | undefined {
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) return undefined;
  const timestamp = events[index]?.["timestamp"];
  return typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp / 1000 : undefined;
}

function displayIndex(value: unknown): string {
  if (typeof value === "number" || typeof value === "string") return String(value);
  return "?";
}

function demoCaptureEventType(action: string): string {
  if (
    ["navigation", "click", "input", "scroll", "hover", "wait", "assertion", "screenshot"].includes(
      action,
    )
  ) {
    return action;
  }
  if (action === "navigate") return "navigation";
  if (action === "type" || action === "upload" || action === "select" || action === "check")
    return "input";
  if (action === "assert") return "assertion";
  return "other";
}

function asJsonObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function buildDemoCaptureEvents(events: JsonObject[]): JsonObject[] {
  return events.map((event, index) => {
    const action = typeof event["action"] === "string" ? event["action"] : "other";
    const timestamp = typeof event["timestamp"] === "number" ? event["timestamp"] : 0;
    const duration = typeof event["duration"] === "number" ? event["duration"] : 0;
    return {
      id: `event-${String(index).padStart(4, "0")}`,
      type: demoCaptureEventType(action),
      label: action,
      startSeconds: Math.max(0, timestamp / 1000),
      endSeconds: Math.max(0, (timestamp + Math.max(0, duration)) / 1000),
      ...(typeof event["selector"] === "string" ? { selector: event["selector"] } : {}),
    };
  });
}

function stepScreenshotEvidence(manifest: JsonObject, events: JsonObject[]): JsonObject[] {
  const evidence: JsonObject[] = [];
  const stepScreenshots = Array.isArray(manifest["stepScreenshots"])
    ? manifest["stepScreenshots"]
    : [];
  for (const item of stepScreenshots) {
    const record = asJsonObject(item);
    if (!record) continue;
    if (typeof record["path"] !== "string") continue;
    evidence.push({
      framePath: record["path"],
      timestampSeconds: eventTimestampSeconds(events, record["stepIndex"]),
      note: `step ${displayIndex(record["stepIndex"])} screenshot`,
    });
  }
  return evidence;
}

function assertScreenshotEvidence(manifest: JsonObject, events: JsonObject[]): JsonObject[] {
  const evidence: JsonObject[] = [];
  const assertPairs = Array.isArray(manifest["assertScreenshotPairs"])
    ? manifest["assertScreenshotPairs"]
    : [];
  for (const item of assertPairs) {
    const record = asJsonObject(item);
    if (!record) continue;
    const timestampSeconds = eventTimestampSeconds(events, record["stepIndex"]);
    for (const [key, label] of [
      ["beforePath", "before assert"],
      ["afterPath", "after assert"],
    ] as const) {
      if (typeof record[key] !== "string") continue;
      evidence.push({
        framePath: record[key],
        timestampSeconds,
        note: `${label} step ${displayIndex(record["stepIndex"])}`,
      });
    }
  }
  return evidence;
}

function chapterScreenshotEvidence(manifest: JsonObject): JsonObject[] {
  const evidence: JsonObject[] = [];
  const chapterScreenshots = Array.isArray(manifest["chapterTitleScreenshots"])
    ? manifest["chapterTitleScreenshots"]
    : [];
  for (const item of chapterScreenshots) {
    const record = asJsonObject(item);
    if (!record) continue;
    if (typeof record["path"] !== "string") continue;
    evidence.push({
      framePath: record["path"],
      note: `chapter ${displayIndex(record["chapterIndex"])} title screenshot`,
    });
  }
  return evidence;
}

function screenshotEvidenceFromManifest(manifest: JsonObject, events: JsonObject[]): JsonObject[] {
  return [
    ...stepScreenshotEvidence(manifest, events),
    ...assertScreenshotEvidence(manifest, events),
    ...chapterScreenshotEvidence(manifest),
  ];
}

function screenshotEvidenceFromVerification(verification: JsonObject | null): JsonObject[] {
  const artifacts = verification?.["artifacts"];
  if (!artifacts || typeof artifacts !== "object") return [];
  const record = artifacts as JsonObject;
  const evidence: JsonObject[] = [];
  const screenshotPaths = Array.isArray(record["screenshotPaths"]) ? record["screenshotPaths"] : [];
  for (const path of screenshotPaths) {
    if (typeof path === "string") evidence.push({ framePath: path, note: "capture screenshot" });
  }
  if (typeof record["failureScreenshotPath"] === "string") {
    evidence.push({ framePath: record["failureScreenshotPath"], note: "failure screenshot" });
  }
  return evidence;
}

function jsonObjectArray(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is JsonObject =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

export async function writeDemoCaptureEvidence(
  params: DemoCaptureEvidenceParams,
): Promise<string | undefined> {
  const { outputDir, videoPath } = params;
  const screenshotManifestPath = join(outputDir, "screenshots", "manifest.json");
  const eventsPath = join(outputDir, "events.json");
  const verificationPath = join(outputDir, "verification.json");
  const screenshotManifest = await readJsonIfExists(screenshotManifestPath);
  const events = jsonObjectArray(await readJsonIfExists(eventsPath));
  const verification = await readJsonIfExists(verificationPath);
  const screenshotEvidence = buildScreenshotEvidence(screenshotManifest, events, verification);
  if (events.length === 0 && screenshotEvidence.length === 0) return undefined;

  return writeJson(join(outputDir, "demo-capture-evidence.json"), {
    schemaVersion: "demo-capture-evidence.v1",
    createdAt: new Date().toISOString(),
    subject: { kind: "demo-capture", bundleDir: outputDir, videoPath },
    videoPath,
    events: buildDemoCaptureEvents(events),
    screenshotEvidence,
    summary: {
      status: "present",
      eventCount: events.length,
      screenshotCount: screenshotEvidence.length,
      metrics: {},
      notes: screenshotEvidence.length > 0 ? [] : ["No screenshot evidence artifacts were found."],
    },
    artifacts: await artifactReferences(screenshotManifestPath, eventsPath, verificationPath),
    diagnostics: [],
  });
}

function buildScreenshotEvidence(
  screenshotManifest: unknown,
  events: JsonObject[],
  verification: unknown,
): JsonObject[] {
  const manifest = asJsonObject(screenshotManifest);
  if (manifest) return screenshotEvidenceFromManifest(manifest, events);
  return screenshotEvidenceFromVerification(asJsonObject(verification));
}

async function artifactReferences(
  screenshotManifestPath: string,
  eventsPath: string,
  verificationPath: string,
): Promise<JsonObject[]> {
  const references: JsonObject[] = [];
  if (await pathExists(screenshotManifestPath)) {
    references.push({ name: "screenshots/manifest.json", path: screenshotManifestPath });
  }
  if (await pathExists(eventsPath)) references.push({ name: "events.json", path: eventsPath });
  if (await pathExists(verificationPath)) {
    references.push({ name: "verification.json", path: verificationPath });
  }
  return references;
}
