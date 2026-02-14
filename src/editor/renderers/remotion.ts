import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "../../utils/logger.js";
import type { Renderer, RenderArgs, RenderResult } from "../renderer-types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger("remotion-renderer");

export class RemotionRenderer implements Renderer {
  readonly id = "remotion";

  // eslint-disable-next-line max-lines-per-function
  async render(args: RenderArgs): Promise<RenderResult> {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
    let bundlerMod: {
      bundle(options: { entryPoint: string; webpackOverride?: unknown }): Promise<string>;
    };
    let rendererMod: {
      selectComposition(options: {
        serveUrl: string;
        id: string;
        inputProps: Record<string, unknown>;
      }): Promise<{ durationInFrames: number; fps: number }>;
      renderMedia(options: {
        composition: { durationInFrames: number; fps: number };
        serveUrl: string;
        codec: string;
        outputLocation: string;
        inputProps: Record<string, unknown>;
      }): Promise<void>;
    };

    try {
      bundlerMod = (await import("@remotion/bundler" as string)) as typeof bundlerMod;
    } catch {
      throw new Error("@remotion/bundler not installed. Run: pnpm add @remotion/bundler");
    }

    try {
      rendererMod = (await import("@remotion/renderer" as string)) as typeof rendererMod;
    } catch {
      throw new Error("@remotion/renderer not installed. Run: pnpm add @remotion/renderer");
    }

    const entryPoint = join(__dirname, "..", "..", "..", "remotion", "src", "Root.tsx");

    log.info("Bundling Remotion composition...");
    const bundleLocation = await bundlerMod.bundle({ entryPoint });

    const videoSrc = join(args.assetsDir, "video.webm");
    const audioSrc = join(args.assetsDir, "narration.wav");

    const inputProps: Record<string, unknown> = {
      specTitle: args.spec.meta.title,
      videoSrc,
      audioSrc,
      resolution: args.spec.meta.resolution,
      fps: 30,
    };

    log.info("Selecting composition...");
    const composition = await rendererMod.selectComposition({
      serveUrl: bundleLocation,
      id: "DemoVideo",
      inputProps,
    });

    log.info(
      `Rendering ${String(composition.durationInFrames)} frames at ${String(composition.fps)} fps...`,
    );
    await rendererMod.renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: args.outFile,
      inputProps,
    });

    const durationMs = (composition.durationInFrames / composition.fps) * 1000;
    log.info(`Remotion render complete: ${args.outFile}`);

    return {
      outFile: args.outFile,
      durationMs,
    };
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
  }
}
