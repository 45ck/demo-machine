import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "../../utils/logger.js";
import type { ActionEvent } from "../../playback/types.js";
import type { Renderer, RenderArgs, RenderResult } from "../renderer-types.js";
import { buildTimeline } from "../timeline.js";
import { FfmpegRenderer } from "./ffmpeg.js";

const log = createLogger("ffmpeg-adapter");

export class FfmpegRendererAdapter implements Renderer {
  readonly id = "ffmpeg";

  async render(args: RenderArgs): Promise<RenderResult> {
    const eventsPath = join(args.assetsDir, "events.json");
    const raw = await readFile(eventsPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`Invalid events.json: expected an array, got ${typeof parsed}`);
    }
    const events = parsed as ActionEvent[];

    log.info(`Loaded ${String(events.length)} events from ${eventsPath}`);

    const timeline = buildTimeline(events, args.spec);
    const inner = new FfmpegRenderer();

    const videoPath = join(args.assetsDir, "video.webm");
    const audioPath = join(args.assetsDir, "narration.wav");

    let hasAudio = false;
    try {
      const { stat } = await import("node:fs/promises");
      const s = await stat(audioPath);
      hasAudio = s.size > 0;
    } catch {
      // no audio file
    }

    const outputPath = await inner.render(timeline, {
      outputPath: args.outFile,
      videoPath,
      ...(hasAudio ? { audioPath } : {}),
      resolution: args.spec.meta.resolution,
    });

    return {
      outFile: outputPath,
      durationMs: timeline.totalDurationMs,
    };
  }
}
