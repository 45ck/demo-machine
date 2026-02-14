import type { Command } from "commander";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("cli:voices");

export function registerVoicesCommand(program: Command): void {
  const voices = program
    .command("voices")
    .description("Manage voice clones and voice configuration");

  voices
    .command("clone")
    .description("Clone a voice from audio samples via ElevenLabs")
    .requiredOption("--name <name>", "Name for the cloned voice")
    .option("--description <desc>", "Description of the voice")
    .argument("<files...>", "Audio sample file paths")
    .action(async (files: string[], cmdOpts: { name: string; description?: string }) => {
      try {
        const { cloneVoice } = await import("../narration/providers/elevenlabs-clone.js");
        const { saveVoiceEntry } = await import("../narration/voice-config.js");

        const result = await cloneVoice({
          name: cmdOpts.name,
          description: cmdOpts.description,
          files,
        });

        await saveVoiceEntry({
          name: result.name,
          voiceId: result.voiceId,
          provider: "elevenlabs",
          createdAt: new Date().toISOString(),
        });

        logger.info(`Voice "${result.name}" cloned (id: ${result.voiceId})`);
      } catch (err) {
        logger.error(String(err));
        process.exitCode = 1;
      }
    });

  voices
    .command("list")
    .description("List saved voice configurations")
    .action(async () => {
      try {
        const { listVoices } = await import("../narration/voice-config.js");
        const entries = await listVoices();
        if (entries.length === 0) {
          logger.info("No voices configured");
          return;
        }
        for (const entry of entries) {
          logger.info(`${entry.name} (${entry.provider}: ${entry.voiceId})`);
        }
      } catch (err) {
        logger.error(String(err));
        process.exitCode = 1;
      }
    });
}
