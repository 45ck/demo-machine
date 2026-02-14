import type { TTSProvider, TTSOptions } from "../types.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("tts:kokoro");

interface RawAudio {
  audio: Float32Array;
  sampling_rate: number;
}

interface KokoroTTSInstance {
  generate: (text: string, options: { voice?: string; speed?: number }) => Promise<RawAudio>;
}

let cachedTTS: KokoroTTSInstance | null = null;

function float32ToWavBuffer(samples: Float32Array, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataLength = samples.length * bytesPerSample;
  const headerLength = 44;
  const buffer = Buffer.alloc(headerLength + dataLength);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(headerLength - 8 + dataLength, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32); // block align
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);

  // Convert float32 samples (-1..1) to int16
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    buffer.writeInt16LE(Math.round(int16), headerLength + i * bytesPerSample);
  }

  return buffer;
}

export class KokoroTTSProvider implements TTSProvider {
  readonly name = "kokoro";

  async synthesize(text: string, options: TTSOptions): Promise<Buffer> {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */
    let mod: any;
    try {
      mod = await import("kokoro-js" as string);
    } catch {
      throw new Error("kokoro-js package not installed. Run: pnpm add kokoro-js");
    }

    if (!cachedTTS) {
      log.info("Loading Kokoro TTS model (first run downloads ~80MB)...");
      cachedTTS = (await mod.KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: "q8",
      })) as KokoroTTSInstance;
      log.info("Kokoro TTS model loaded");
    }

    const voice = options.voice ?? "af_heart";
    const speed = options.speed ?? 1.0;

    log.info(`Synthesizing ${text.length} chars with voice=${voice} speed=${speed}`);

    const audio: RawAudio = await cachedTTS.generate(text, { voice, speed });
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */

    const wavBuffer = float32ToWavBuffer(audio.audio, audio.sampling_rate);
    log.info(`Generated ${(wavBuffer.length / 1024).toFixed(0)}KB WAV audio`);
    return wavBuffer;
  }
}
