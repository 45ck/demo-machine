import type { TTSProvider, TTSOptions } from "../types.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("tts:elevenlabs");

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

    const apiKey = process.env["ELEVENLABS_API_KEY"];
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY environment variable is not set");
    }

    const voice = options.voice ?? "Rachel";

    log.info(`Synthesizing ${text.length} chars with voice=${voice}`);

    const ElevenLabsClient = mod.ElevenLabsClient;
    const client = new ElevenLabsClient({ apiKey });
    const stream = await client.textToSpeech.convert(voice, {
      text,
      model_id: "eleven_monolingual_v1",
    });

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
  }
}
