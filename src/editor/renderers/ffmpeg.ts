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
    const args: string[] = ["-y"];

    this.addTrimStart(args, options.trimStartMs);
    args.push("-i", options.videoPath);
    this.addAudioInput(args, options);
    this.addFilterGraph(args, timeline, options);
    this.addAudioMapping(args, options);
    this.addDuration(args, timeline, options);

    args.push("-c:v", "libx264", "-preset", "fast", "-crf", "23");
    args.push(options.outputPath);
    return args;
  }

  private addTrimStart(args: string[], trimStartMs: number | undefined): void {
    if (trimStartMs !== undefined && trimStartMs > 0) {
      args.push("-ss", msToSec(trimStartMs));
    }
  }

  private addAudioInput(args: string[], options: RenderOptions): void {
    if (!options.audioPath) return;
    this.addTrimStart(args, options.audioTrimStartMs);
    args.push("-i", options.audioPath);
  }

  private addFilterGraph(args: string[], timeline: Timeline, options: RenderOptions): void {
    const filterGraph = this.buildFilterGraph(timeline, options);
    if (!filterGraph) return;
    args.push("-filter_complex", filterGraph);
    args.push("-map", "[vout]");
  }

  private addAudioMapping(args: string[], options: RenderOptions): void {
    if (!options.audioPath) return;
    args.push("-map", "1:a");
    args.push("-af", "apad");
  }

  private addDuration(args: string[], timeline: Timeline, options: RenderOptions): void {
    const renderDurationMs = renderDurationMsFor(timeline, options);
    if (renderDurationMs > 0) args.push("-t", msToSec(renderDurationMs));
  }

  private buildFilterGraph(timeline: Timeline, options: RenderOptions): string | undefined {
    const filterSteps: string[] = [];
    const renderDurationMs = renderDurationMsFor(timeline, options);

    if (renderDurationMs > 0) {
      filterSteps.push(`tpad=stop_mode=clone:stop_duration=${msToSec(renderDurationMs)}`);
    }

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
      parts.push(`${inputLabel}${filterSteps[i]!}${outputLabel}`);
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
    const fontSize = isIntroOutro ? 52 : 36;
    const boxColor = isIntroOutro ? "black@0.7" : "black@0.45";
    const boxPadding = isIntroOutro ? 24 : 14;
    const yPos = isIntroOutro ? "(h-text_h)/2" : "96";

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

      const MAX_STDERR = 4096;
      let stderr = "";

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
        if (stderr.length > MAX_STDERR) {
          stderr = stderr.slice(-MAX_STDERR);
        }
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

function renderDurationMsFor(timeline: Timeline, options: RenderOptions): number {
  return Math.max(timeline.totalDurationMs, options.extendToMs ?? 0);
}

function escapeDrawtext(text: string): string {
  return (
    text
      .replace(/%/g, "%%")
      .replace(/\n/g, " ")
      .replace(/\\/g, "\\\\")
      // ASCII single-quote is the worst character to hand ffmpeg's filter
      // graph parser: even with backslash-escape inside a single-quoted
      // text= argument, the parser intermittently terminates the value
      // early and then tries to parse the rest of the filter graph as a
      // chain of new filters — producing baffling "No such filter: '...)'"
      // errors. Swap it for U+2019 (typographic right single quotation
      // mark): visually indistinguishable in the rendered overlay, but
      // unambiguous to the parser.
      .replace(/'/g, "’")
      .replace(/:/g, "\\:")
      .replace(/;/g, "\\;")
      .replace(/\[/g, "\\[")
      .replace(/]/g, "\\]")
      .replace(/=/g, "\\=")
  );
}
