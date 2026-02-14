import { spawn } from "node:child_process";
import { createLogger } from "../../utils/logger.js";
import type { RenderOptions, Segment, Timeline, VideoRenderer } from "../types.js";

const log = createLogger("ffmpeg-renderer");

export class FfmpegRenderer implements VideoRenderer {
  readonly name = "ffmpeg";

  async render(timeline: Timeline, options: RenderOptions): Promise<string> {
    const args = this.buildArgs(timeline, options);
    log.info(`Spawning ffmpeg with ${args.length} args`);
    log.debug(`ffmpeg args: ${args.join(" ")}`);

    await this.spawnFfmpeg(args);
    log.info(`Render complete: ${options.outputPath}`);
    return options.outputPath;
  }

  private buildArgs(timeline: Timeline, options: RenderOptions): string[] {
    const args: string[] = ["-y", "-i", options.videoPath];

    if (options.audioPath) {
      args.push("-i", options.audioPath);
    }

    const filterGraph = this.buildFilterGraph(timeline, options);
    if (filterGraph) {
      args.push("-filter_complex", filterGraph);
      args.push("-map", "[vout]");
    }

    if (options.audioPath) {
      args.push("-map", "1:a", "-shortest");
    }

    args.push("-c:v", "libx264", "-preset", "fast", "-crf", "23");
    args.push(options.outputPath);
    return args;
  }

  private buildFilterGraph(timeline: Timeline, options: RenderOptions): string | undefined {
    const filterSteps: string[] = [];

    for (const segment of timeline.segments) {
      const filter = this.segmentToFilter(segment, options);
      if (filter) {
        filterSteps.push(filter);
      }
    }

    if (filterSteps.length === 0) return undefined;

    // Chain filters: [0:v] -> filter1 -> [v1] -> filter2 -> [v2] -> ... -> [vout]
    const parts: string[] = [];
    for (let i = 0; i < filterSteps.length; i++) {
      const inputLabel = i === 0 ? "[0:v]" : `[v${i}]`;
      const outputLabel = i === filterSteps.length - 1 ? "[vout]" : `[v${i + 1}]`;
      parts.push(`${inputLabel}${filterSteps[i]}${outputLabel}`);
    }

    return parts.join(";");
  }

  private segmentToFilter(segment: Segment, options: RenderOptions): string | undefined {
    switch (segment.type) {
      case "intro":
      case "chapter":
      case "outro":
        return this.buildDrawtextFilter(segment, options);
      default:
        return undefined;
    }
  }

  private buildDrawtextFilter(segment: Segment, options: RenderOptions): string {
    const text = escapeDrawtext(segment.label ?? "");
    const color = options.branding?.colors?.primary ?? "white";
    const start = msToSec(segment.startMs);
    const end = msToSec(segment.endMs);

    const isIntroOutro = segment.type === "intro" || segment.type === "outro";
    const fontSize = isIntroOutro ? 64 : 42;
    const boxColor = isIntroOutro ? "black@0.7" : "black@0.5";
    const boxPadding = isIntroOutro ? 30 : 20;
    const yPos = isIntroOutro ? "(h-text_h)/2" : "h*0.75";

    const fadeIn = 0.3;
    const fadeOut = 0.3;
    const alphaExpr =
      `if(lt(t-${start},${fadeIn}),(t-${start})/${fadeIn},` +
      `if(lt(${end}-t,${fadeOut}),(${end}-t)/${fadeOut},1))`;

    return (
      `drawtext=text='${text}':fontsize=${fontSize}:fontcolor=${color}:` +
      `x=(w-text_w)/2:y=${yPos}:` +
      `box=1:boxcolor=${boxColor}:boxborderw=${boxPadding}:` +
      `alpha='${alphaExpr}':` +
      `enable='between(t,${start},${end})'`
    );
  }

  private spawnFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn("ffmpeg", args, { stdio: "pipe" });

      let stderr = "";

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg exited with code ${String(code)}: ${stderr.slice(-500)}`));
        }
      });
    });
  }
}

function msToSec(ms: number): string {
  return (ms / 1000).toFixed(3);
}

function escapeDrawtext(text: string): string {
  return text.replace(/'/g, "\\'").replace(/:/g, "\\:");
}
