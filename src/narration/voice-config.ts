import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "../utils/logger.js";

const log = createLogger("voice-config");

export interface VoiceEntry {
  name: string;
  voiceId: string;
  provider: string;
  createdAt: string;
}

export interface VoiceConfig {
  voices: VoiceEntry[];
}

function getConfigDir(): string {
  return join(homedir(), ".demo-machine");
}

function getConfigPath(): string {
  return join(getConfigDir(), "voices.json");
}

export async function loadVoiceConfig(): Promise<VoiceConfig> {
  try {
    const raw = await readFile(getConfigPath(), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as Record<string, unknown>)["voices"])
    ) {
      log.warn("Voice config has invalid structure, using empty config");
      return { voices: [] };
    }
    return parsed as VoiceConfig;
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return { voices: [] };
    }
    log.warn(`Failed to load voice config: ${String(err)}`);
    return { voices: [] };
  }
}

export async function saveVoiceEntry(entry: VoiceEntry): Promise<void> {
  const config = await loadVoiceConfig();
  const existing = config.voices.findIndex((v) => v.name === entry.name);
  if (existing >= 0) {
    config.voices[existing] = entry;
  } else {
    config.voices.push(entry);
  }
  await mkdir(getConfigDir(), { recursive: true });
  await writeFile(getConfigPath(), JSON.stringify(config, null, 2) + "\n", "utf-8");
  log.info(`Voice entry saved: ${entry.name} (${entry.voiceId})`);
}

export async function listVoices(): Promise<VoiceEntry[]> {
  const config = await loadVoiceConfig();
  return config.voices;
}
