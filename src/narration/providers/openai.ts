import type { TTSProvider, TTSOptions } from "../types.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("tts:openai");

export class OpenAITTSProvider implements TTSProvider {
  readonly name = "openai";

  // eslint-disable-next-line max-lines-per-function
  async synthesize(text: string, options: TTSOptions): Promise<Buffer> {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */
    let mod: any;
    try {
      mod = await import("openai" as string);
    } catch {
      throw new Error("openai package not installed. Run: pnpm add openai");
    }

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }

    const OpenAI = mod.default;
    const client = new OpenAI({ apiKey });
    const voice = options.voice ?? "alloy";
    const speed = options.speed ?? 1.0;

    log.info(`Synthesizing ${text.length} chars with voice=${voice} speed=${speed}`);

    const response = await client.audio.speech.create({
      model: "tts-1",
      voice,
      speed,
      input: text,
    });

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */
  }
}
