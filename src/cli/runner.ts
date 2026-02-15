/**
 * Main demo runner with narration pre-synthesis
 */

import { chromium, type Browser } from "playwright";
import type { DemoSpec, NarrationTimingMap } from "../narration/types.js";
import type { ActionEvent } from "../playback/types.js";
import { preSynthesizeNarration } from "../narration/pre-synthesizer.js";
import { PlaybackEngine } from "../playback/engine.js";
import { mixPreSynthesizedNarration } from "../narration/audio-mixer.js";

export interface RunOptions {
  output: string;
  headless: boolean;
  narration: {
    enabled: boolean;
    provider?: "kokoro" | "openai" | "elevenlabs" | "piper";
    voice?: string;
    sync?: {
      mode: "auto-sync" | "manual" | "warn-only";
      bufferMs: number;
    };
  };
  verbose: boolean;
}

/**
 * Main demo runner function
 * Orchestrates pre-synthesis, playback, and rendering
 */
export async function runDemo(spec: DemoSpec, options: RunOptions): Promise<string> {
  let browser: Browser | null = null;
  let narrationTiming: NarrationTimingMap | null = null;

  try {
    // Step 1: Pre-synthesize narration if enabled and in auto-sync mode
    if (options.narration?.enabled && options.narration?.sync?.mode === "auto-sync") {
      console.log("[INFO] Pre-synthesizing narration for timing...");
      narrationTiming = await preSynthesizeNarration(spec, options.narration, options.output);
      console.log(`[INFO] Pre-synthesis complete: ${narrationTiming.size} segments`);
    } else if (options.narration?.enabled) {
      console.log(`[INFO] Narration sync mode: ${options.narration.sync?.mode || "manual"}`);
      console.log("[INFO] Skipping pre-synthesis, using YAML-specified delays");
    }

    // Step 2: Launch browser
    console.log("[INFO] Launching browser...");
    browser = await chromium.launch({
      headless: options.headless,
    });

    const page = await browser.newPage();

    // Step 3: Create playback engine with narration timing
    const engine = new PlaybackEngine(spec, page, narrationTiming);

    // Step 4: Execute playback (now narration-aware)
    console.log("[INFO] Starting demo playback...");
    const events: ActionEvent[] = await engine.execute();

    // Step 5: Close browser
    await browser.close();
    browser = null;

    console.log("[INFO] Playback complete");

    // Step 6: Mix pre-synthesized audio into video (if narration enabled)
    if (narrationTiming && narrationTiming.size > 0) {
      console.log("[INFO] Mixing pre-synthesized narration...");
      const outputPath = await mixPreSynthesizedNarration(events, narrationTiming, options.output);
      console.log(`[INFO] Demo generated: ${outputPath}`);
      return outputPath;
    }

    // Return placeholder path (in real implementation, this would be the video path)
    const outputPath = `${options.output}/output.mp4`;
    console.log(`[INFO] Demo generated: ${outputPath} (narration not enabled)`);
    return outputPath;
  } catch (error) {
    console.error("[ERROR] Demo generation failed:", error);

    // Cleanup browser if still open
    if (browser) {
      await browser.close();
    }

    throw error;
  }
}

/**
 * Warn-only mode: Check if narration is longer than delays and warn
 */
export function checkNarrationTiming(spec: DemoSpec, narrationTiming: NarrationTimingMap): void {
  console.log("[INFO] Checking narration timing against YAML delays...");

  let warnings = 0;
  let actionIndex = 0;

  for (const chapter of spec.chapters) {
    for (const step of chapter.steps) {
      const narration = narrationTiming.get(actionIndex);

      if (narration && step.delay !== undefined) {
        const bufferMs = spec.narration?.sync?.bufferMs || 500;
        const requiredDelay = narration.durationMs + bufferMs;

        if (step.delay < requiredDelay) {
          console.warn(
            `[WARN] Action ${actionIndex} (${step.action}): delay ${step.delay}ms is shorter than narration ${(narration.durationMs / 1000).toFixed(1)}s`,
          );
          console.warn(
            `[WARN]   Recommendation: increase delay to ${requiredDelay}ms or use auto-sync mode`,
          );
          warnings++;
        }
      }

      actionIndex++;
    }
  }

  if (warnings === 0) {
    console.log("[INFO] ✓ All narration timing looks good!");
  } else {
    console.log(`[WARN] Found ${warnings} timing warnings`);
  }
}
