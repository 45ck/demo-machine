import type { VideoRenderer } from "./types.js";
import type { Renderer } from "./renderer-types.js";
import { FfmpegRenderer } from "./renderers/ffmpeg.js";

export function createRenderer(name: string): VideoRenderer {
  if (name === "ffmpeg") {
    return new FfmpegRenderer();
  }
  throw new Error(`Unknown renderer: "${name}". Supported: "ffmpeg".`);
}

export async function createRendererV2(id: string): Promise<Renderer> {
  switch (id) {
    case "ffmpeg": {
      const { FfmpegRendererAdapter } = await import("./renderers/ffmpeg-adapter.js");
      return new FfmpegRendererAdapter();
    }
    case "remotion": {
      const { RemotionRenderer } = await import("./renderers/remotion.js");
      return new RemotionRenderer();
    }
    default:
      throw new Error(`Unknown renderer: "${id}". Supported: "ffmpeg", "remotion".`);
  }
}
