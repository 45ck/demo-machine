import type { TTSProvider, TTSOptions, ElevenLabsVoiceSettings } from "../types.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("tts:elevenlabs");

function buildVoiceSettings(settings: ElevenLabsVoiceSettings): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (settings.stability !== undefined) result["stability"] = settings.stability;
  if (settings.similarity_boost !== undefined)
    result["similarity_boost"] = settings.similarity_boost;
  if (settings.style !== undefined) result["style"] = settings.style;
  if (settings.use_speaker_boost !== undefined)
    result["use_speaker_boost"] = settings.use_speaker_boost;
  return result;
}

export class ElevenLabsTTSProvider implements TTSProvider {
  readonly name = "elevenlabs";

  // eslint-disable-next-line max-lines-per-function
  async synthesize(text: string, options: TTSOptions): Promise<Buffer> {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
    let mod: any;
    try {
      mod = await import("@elevenlabs/elevenlabs-js" as string);
    } catch {
      throw new Error(
        "@elevenlabs/elevenlabs-js package not installed. Run: pnpm add @elevenlabs/elevenlabs-js",
      );
    }

    const apiKey = process.env["ELEVENLABS_API_KEY"]?.trim();
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY environment variable is not set");
    }

    const voice = options.voice ?? "Rachel";
    const model = options.model ?? "eleven_multilingual_v2";

    log.info(`Synthesizing ${text.length} chars with voice=${voice} model=${model}`);

    const ElevenLabsClient = mod.ElevenLabsClient;
    const client = new ElevenLabsClient({ apiKey });

    const requestBody: Record<string, unknown> = {
      text,
      model_id: model,
      output_format: options.outputFormat ?? "mp3_44100_128",
    };

    if (options.voiceSettings) {
      requestBody["voice_settings"] = buildVoiceSettings(options.voiceSettings);
    }

    const stream = await client.textToSpeech.convert(voice, requestBody);

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
  }
}
