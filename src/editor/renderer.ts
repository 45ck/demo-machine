import type { VideoRenderer } from "./types.js";
import { FfmpegRenderer } from "./renderers/ffmpeg.js";

export function createRenderer(name: string): VideoRenderer {
  if (name === "ffmpeg") {
    return new FfmpegRenderer();
  }
  throw new Error(`Unknown renderer: "${name}". Supported: "ffmpeg".`);
}
