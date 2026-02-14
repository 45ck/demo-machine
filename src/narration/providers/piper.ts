import { spawn } from "node:child_process";
import type { TTSProvider, TTSOptions } from "../types.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("tts:piper");

export class PiperTTSProvider implements TTSProvider {
  readonly name = "piper";

  synthesize(text: string, options: TTSOptions): Promise<Buffer> {
    const voice = options.voice ?? "en_US-lessac-medium";

    log.info(`Synthesizing ${text.length} chars with voice=${voice}`);

    return new Promise<Buffer>((resolve, reject) => {
      const args = ["--model", voice, "--output-raw"];
      const proc = spawn("piper", args, { stdio: ["pipe", "pipe", "pipe"] });

      const chunks: Buffer[] = [];
      let stderr = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
          reject(new Error("piper binary not found. Install piper TTS."));
        } else {
          reject(err);
        }
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`piper exited with code ${code}: ${stderr}`));
          return;
        }
        resolve(Buffer.concat(chunks));
      });

      proc.stdin.write(text);
      proc.stdin.end();
    });
  }
}
