import { writeFile, readFile } from "node:fs/promises";
import type { ActionEvent } from "../playback/types.js";

export async function writeEventLog(events: ActionEvent[], outputPath: string): Promise<void> {
  const json = JSON.stringify(events, null, 2);
  await writeFile(outputPath, json, "utf-8");
}

export async function readEventLog(path: string): Promise<ActionEvent[]> {
  const raw = await readFile(path, "utf-8");
  const parsed: unknown = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("Event log must be a JSON array");
  }

  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("Each event must be an object");
    }
    const record = entry as Record<string, unknown>;
    if (typeof record["action"] !== "string") {
      throw new Error("Each event must have a string 'action' field");
    }
    if (typeof record["timestamp"] !== "number") {
      throw new Error("Each event must have a numeric 'timestamp' field");
    }
    if (typeof record["duration"] !== "number") {
      throw new Error("Each event must have a numeric 'duration' field");
    }
  }

  return parsed as ActionEvent[];
}
