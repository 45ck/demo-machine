import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ActionEvent } from "../playback/types.js";
import type { DemoSpec } from "../spec/types.js";
import { shareViewerConfigSchema, type ShareViewerConfig } from "../spec/share-schema.js";
import { generateVTT } from "../narration/subtitles.js";
import { deriveReviewedSpecCaptions } from "./captions.js";
import { deriveViewerChapters } from "./chapters.js";
import { createViewerDocument, type ViewerSecurityPolicies } from "./template.js";
import { parseVttTranscript, type TranscriptCue } from "./transcript.js";

const VIEWER_FILE = "viewer.html";
const MANIFEST_FILE = "viewer.manifest.json";
const MAX_VIEWER_DURATION_MS = 24 * 60 * 60 * 1_000;

interface HashedAsset {
  path: string;
  sha256: string;
}

export interface ShareViewerResult {
  viewerPath: string;
  manifestPath: string;
  manifest: ShareViewerManifest;
}

export interface ShareViewerManifest {
  schemaVersion: 1;
  kind: "demo-machine-share-viewer";
  entrypoint: HashedAsset;
  title: string;
  summary: string;
  durationMs: number;
  profile: ShareViewerConfig["profile"];
  brand: ShareViewerConfig["brand"];
  callsToAction: {
    primary: ShareViewerConfig["primaryCta"];
    secondary?: ShareViewerConfig["secondaryCta"];
  };
  publication: {
    publicSafe: boolean;
    noindex: boolean;
    embed: {
      mode: ShareViewerConfig["embedMode"];
      frameAncestors: ViewerSecurityPolicies["frameAncestors"];
      requiredResponseHeaders: {
        "Content-Security-Policy": string;
        "X-Frame-Options": ViewerSecurityPolicies["xFrameOptions"];
      };
    };
  };
  media: {
    video: HashedAsset & { type: "video/mp4" | "video/webm" };
    poster?: HashedAsset;
    captions?: HashedAsset & { language: string; label: string; cueCount: number };
  };
  chapters: Array<{ title: string; startMs: number }>;
  accessibility: {
    nativeControls: true;
    captions: boolean;
    transcript: boolean;
    timestampedTranscript: boolean;
    transcriptSearch: boolean;
    copyLink: true;
    playbackRates: number[];
    keyboardShortcuts: string[];
    reducedMotion: true;
  };
  privacy: { analytics: false; tracking: false; externalAssets: false; cookies: false };
}

async function isRegularFile(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    const file = await lstat(filePath);
    return file.isFile() && !file.isSymbolicLink();
  } catch {
    return false;
  }
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readTranscript(filePath: string): Promise<TranscriptCue[]> {
  if (!(await isRegularFile(filePath))) return [];
  return parseVttTranscript(await readFile(filePath, "utf8"));
}

async function requireAsset(outputDir: string, filename: string, label: string): Promise<string> {
  const assetPath = path.join(outputDir, filename);
  if (!(await isRegularFile(assetPath))) {
    throw new Error(`${label} not found beside the viewer output: ${filename}`);
  }
  return assetPath;
}

async function optionalAsset(
  outputDir: string,
  filename: string | undefined,
): Promise<string | undefined> {
  if (!filename) return undefined;
  const assetPath = path.join(outputDir, filename);
  return (await isRegularFile(assetPath)) ? assetPath : undefined;
}

async function resolveCaptionsAsset(params: {
  outputDir: string;
  filename: string;
  spec: DemoSpec;
  events: ActionEvent[];
  startTimestamp: number;
  durationMs: number;
}): Promise<string | undefined> {
  const captionsPath = path.join(params.outputDir, params.filename);
  try {
    const file = await lstat(captionsPath);
    if (!file.isFile() || file.isSymbolicLink()) {
      throw new Error(`Captions must be a regular sibling file: ${params.filename}`);
    }
    return captionsPath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const captions = deriveReviewedSpecCaptions({
    spec: params.spec,
    events: params.events,
    startTimestamp: params.startTimestamp,
    durationMs: params.durationMs,
  });
  if (captions.length === 0) return undefined;
  await writeFile(captionsPath, generateVTT(captions), { encoding: "utf8", flag: "wx" });
  return captionsPath;
}

async function buildManifest(params: {
  config: ShareViewerConfig;
  title: string;
  viewerHtml: string;
  videoPath: string;
  posterPath?: string | undefined;
  captionsPath?: string | undefined;
  transcript: TranscriptCue[];
  chapters: ShareViewerManifest["chapters"];
  durationMs: number;
  policies: ViewerSecurityPolicies;
}): Promise<ShareViewerManifest> {
  const videoType = params.config.video.endsWith(".webm") ? "video/webm" : "video/mp4";
  return {
    schemaVersion: 1,
    kind: "demo-machine-share-viewer",
    entrypoint: { path: VIEWER_FILE, sha256: hashText(params.viewerHtml) },
    title: params.title,
    summary: params.config.summary,
    durationMs: params.durationMs,
    profile: params.config.profile,
    brand: params.config.brand,
    callsToAction: {
      primary: params.config.primaryCta,
      ...(params.config.secondaryCta ? { secondary: params.config.secondaryCta } : {}),
    },
    publication: {
      publicSafe: params.config.publicSafe,
      noindex: params.config.noindex || !params.config.publicSafe,
      embed: {
        mode: params.config.embedMode,
        frameAncestors: params.policies.frameAncestors,
        requiredResponseHeaders: {
          "Content-Security-Policy": params.policies.responseContentSecurityPolicy,
          "X-Frame-Options": params.policies.xFrameOptions,
        },
      },
    },
    media: {
      video: {
        path: params.config.video,
        sha256: await hashFile(params.videoPath),
        type: videoType,
      },
      ...(params.posterPath && params.config.poster
        ? { poster: { path: params.config.poster, sha256: await hashFile(params.posterPath) } }
        : {}),
      ...(params.captionsPath
        ? {
            captions: {
              path: params.config.captions,
              sha256: await hashFile(params.captionsPath),
              language: params.config.language,
              label: params.config.captionLabel,
              cueCount: params.transcript.length,
            },
          }
        : {}),
    },
    chapters: params.chapters,
    accessibility: {
      nativeControls: true,
      captions: Boolean(params.captionsPath),
      transcript: params.transcript.length > 0,
      timestampedTranscript: params.transcript.length > 0,
      transcriptSearch: params.transcript.length > 0,
      copyLink: true,
      playbackRates: [0.75, 1, 1.25, 1.5, 2],
      keyboardShortcuts: ["Space/K", "ArrowLeft/ArrowRight", "J/L", "M", "C", "F"],
      reducedMotion: true,
    },
    privacy: { analytics: false, tracking: false, externalAssets: false, cookies: false },
  };
}

export async function generateShareViewer(params: {
  outputDir: string;
  config: unknown;
  spec: DemoSpec;
  events: ActionEvent[];
  startTimestamp: number;
  durationMs: number;
}): Promise<ShareViewerResult> {
  const config = shareViewerConfigSchema.parse(params.config);
  if (!config.enabled) throw new Error("Share viewer generation is disabled in the demo spec");
  if (
    !Number.isFinite(params.durationMs) ||
    params.durationMs < 1 ||
    params.durationMs > MAX_VIEWER_DURATION_MS
  ) {
    throw new Error("Viewer duration must be a finite value between 1ms and 24 hours");
  }
  const durationMs = Math.round(params.durationMs);
  const outputDir = path.resolve(params.outputDir);
  await mkdir(outputDir, { recursive: true });
  const videoPath = await requireAsset(outputDir, config.video, "Video");
  const posterPath = await optionalAsset(outputDir, config.poster);
  if (config.poster && !posterPath) {
    throw new Error(`Poster not found beside the viewer output: ${config.poster}`);
  }
  const captionsPath = await resolveCaptionsAsset({
    outputDir,
    filename: config.captions,
    spec: params.spec,
    events: params.events,
    startTimestamp: params.startTimestamp,
    durationMs,
  });
  const transcript = captionsPath ? await readTranscript(captionsPath) : [];
  const chapters = deriveViewerChapters({
    spec: params.spec,
    events: params.events,
    startTimestamp: params.startTimestamp,
  });
  if (chapters.some((chapter) => chapter.startMs > durationMs)) {
    throw new Error("Viewer chapter timing exceeds the rendered video duration");
  }
  const title = config.title ?? params.spec.meta.title;
  const document = createViewerDocument({
    config,
    title,
    durationMs,
    chapters,
    transcript,
    captionsAvailable: Boolean(captionsPath),
    posterAvailable: Boolean(posterPath),
  });
  const manifest = await buildManifest({
    config,
    title,
    viewerHtml: document.html,
    videoPath,
    posterPath,
    captionsPath,
    transcript,
    chapters,
    durationMs,
    policies: document.policies,
  });
  const viewerPath = path.join(outputDir, VIEWER_FILE);
  const manifestPath = path.join(outputDir, MANIFEST_FILE);
  await writeFile(viewerPath, document.html, "utf8");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { viewerPath, manifestPath, manifest };
}
