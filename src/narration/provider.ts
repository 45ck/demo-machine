import type { TTSProvider } from "./types.js";
import { OpenAITTSProvider } from "./providers/openai.js";
import { ElevenLabsTTSProvider } from "./providers/elevenlabs.js";
import { PiperTTSProvider } from "./providers/piper.js";

export function createTTSProvider(name: string): TTSProvider {
  switch (name) {
    case "openai":
      return new OpenAITTSProvider();
    case "elevenlabs":
      return new ElevenLabsTTSProvider();
    case "piper":
      return new PiperTTSProvider();
    default:
      throw new Error(`Unknown TTS provider: "${name}"`);
  }
}
