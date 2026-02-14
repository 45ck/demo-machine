import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("elevenlabs-clone");

export interface CloneVoiceOptions {
  name: string;
  description?: string | undefined;
  files: string[];
}

export interface CloneVoiceResult {
  voiceId: string;
  name: string;
}

export async function cloneVoice(options: CloneVoiceOptions): Promise<CloneVoiceResult> {
  const apiKey = process.env["ELEVENLABS_API_KEY"]?.trim();
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY environment variable is not set");
  }

  if (options.files.length === 0) {
    throw new Error("At least one audio file is required for voice cloning");
  }

  log.info(`Cloning voice "${options.name}" from ${String(options.files.length)} file(s)`);

  const formData = new FormData();
  formData.append("name", options.name);
  if (options.description) {
    formData.append("description", options.description);
  }

  for (const filePath of options.files) {
    const buffer = await readFile(filePath);
    const blob = new Blob([buffer]);
    formData.append("files", blob, basename(filePath));
  }

  const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    log.debug(`ElevenLabs error body: ${body.slice(0, 500)}`);
    throw new Error(`ElevenLabs voice cloning failed (${String(response.status)})`);
  }

  const data = (await response.json()) as { voice_id: string };
  log.info(`Voice cloned successfully: id=${data.voice_id}`);

  return { voiceId: data.voice_id, name: options.name };
}
