import { createLogger } from "../utils/logger.js";
import type { GlobalOptions } from "./options.js";

const log = createLogger("cli:doctor");

async function checkCmd(cmd: string, args: string[]): Promise<boolean> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

async function checkOutputDir(outputDir: string): Promise<boolean> {
  const { mkdir, statfs } = await import("node:fs/promises");
  try {
    await mkdir(outputDir, { recursive: true });
    const s = await statfs(outputDir);
    const freeBytes = s.bavail * s.bsize;
    const freeGB = freeBytes / (1024 * 1024 * 1024);
    log.info(`Output dir: ${outputDir} (free ~${freeGB.toFixed(1)} GB)`);
    if (freeGB < 10) {
      log.warn("Low disk space: rendering/video capture can consume many GB quickly");
    }
    return true;
  } catch (err) {
    log.error(`Output dir check failed: ${String(err)}`);
    return false;
  }
}

async function checkFfmpeg(): Promise<boolean> {
  const hasFfmpeg = await checkCmd("ffmpeg", ["-version"]);
  const hasFfprobe = await checkCmd("ffprobe", ["-version"]);

  if (hasFfmpeg) log.info("ffmpeg: OK");
  else log.error("ffmpeg not found on PATH (required for rendering and audio mixing)");

  if (hasFfprobe) log.info("ffprobe: OK");
  else log.error("ffprobe not found on PATH (required for measuring narration durations)");

  return hasFfmpeg && hasFfprobe;
}

async function checkPlaywright(): Promise<boolean> {
  try {
    const pw = await import("playwright");
    const browser = await pw.chromium.launch({ headless: true });
    await browser.close();
    log.info("playwright chromium: OK");
    return true;
  } catch (err) {
    log.error(`playwright chromium launch failed: ${String(err)}`);
    return false;
  }
}

async function checkTtsProvider(opts: GlobalOptions): Promise<boolean> {
  const provider = opts.ttsProvider;

  if (provider === "kokoro") {
    try {
      await import("kokoro-js" as string);
      log.info("kokoro-js: OK");
    } catch {
      log.warn("kokoro-js not installed. TTS will fail until installed (pnpm add kokoro-js).");
    }
    return true;
  }

  if (provider === "openai") {
    log.info(process.env["OPENAI_API_KEY"] ? "OPENAI_API_KEY: set" : "OPENAI_API_KEY: not set");
    return true;
  }

  if (provider === "elevenlabs") {
    log.info(
      process.env["ELEVENLABS_API_KEY"] ? "ELEVENLABS_API_KEY: set" : "ELEVENLABS_API_KEY: not set",
    );
    return true;
  }

  if (provider === "piper") {
    const hasPiper = await checkCmd("piper", ["--help"]);
    if (!hasPiper) log.warn("piper binary not found on PATH");
    else log.info("piper: OK");
    return true;
  }

  return true;
}

export async function runDoctor(opts: GlobalOptions): Promise<boolean> {
  const outputOk = await checkOutputDir(opts.output);
  const ffmpegOk = await checkFfmpeg();
  const playwrightOk = await checkPlaywright();
  await checkTtsProvider(opts);
  return outputOk && ffmpegOk && playwrightOk;
}
