import { createHash } from "node:crypto";
import type { ShareCta, ShareViewerConfig } from "../spec/share-schema.js";
import { formatViewerTime, type ViewerChapter } from "./chapters.js";
import { VIEWER_SCRIPT } from "./script.js";
import { createViewerStyles } from "./styles.js";
import type { TranscriptCue } from "./transcript.js";

export interface ViewerTemplateInput {
  config: ShareViewerConfig;
  title: string;
  durationMs: number;
  chapters: ViewerChapter[];
  transcript: TranscriptCue[];
  captionsAvailable: boolean;
  posterAvailable: boolean;
}

export interface ViewerSecurityPolicies {
  documentContentSecurityPolicy: string;
  responseContentSecurityPolicy: string;
  frameAncestors: "'none'" | "'self'";
  xFrameOptions: "DENY" | "SAMEORIGIN";
}

export interface ViewerDocument {
  html: string;
  policies: ViewerSecurityPolicies;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function contentHash(value: string): string {
  return createHash("sha256").update(value).digest("base64");
}

function renderFavicon(primary: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${primary}"/><path d="M18 18h10v28H18zm18 0h10v28H36z" fill="white"/></svg>`;
  return `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(svg)}">`;
}

function renderCta(cta: ShareCta, variant: "primary" | "secondary"): string {
  return `<a class="cta cta-${variant}" href="${escapeHtml(cta.url)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(cta.label)}</a>`;
}

function renderChapters(chapters: ViewerChapter[]): string {
  return chapters
    .map(
      (chapter, index) => `<li>
        <button class="chapter-button" type="button" data-chapter-start="${String(chapter.startMs)}" data-chapter-title="${escapeHtml(chapter.title)}"${index === 0 ? ' aria-current="true"' : ""}>
          <span class="time">${formatViewerTime(chapter.startMs)}</span>
          <span class="chapter-title">${escapeHtml(chapter.title)}</span>
        </button>
      </li>`,
    )
    .join("\n");
}

function renderTranscript(cues: TranscriptCue[]): string {
  if (cues.length === 0) return "<p>There is no transcript for this recording.</p>";
  const items = cues
    .map((cue) => {
      const time = formatViewerTime(cue.startMs);
      return `<li data-transcript-cue>
        <button class="transcript-time" type="button" data-transcript-start="${String(cue.startMs)}" aria-label="Seek recording to ${time}">${time}</button>
        <span class="cue-text">${escapeHtml(cue.text)}</span>
      </li>`;
    })
    .join("\n");
  return `<div class="transcript-tools">
    <label for="transcript-search">Search transcript</label>
    <input id="transcript-search" type="search" inputmode="search" autocomplete="off" data-transcript-search>
    <button class="utility-button" type="button" data-copy-transcript>Copy transcript</button>
    <span class="transcript-status" data-transcript-status role="status" aria-live="polite">${String(cues.length)} transcript cues</span>
  </div>
  <ol class="transcript">${items}</ol>`;
}

function renderKeyboardHelp(): string {
  const shortcuts = [
    ["Space / K", "Play or pause"],
    ["← / →", "Seek five seconds"],
    ["J / L", "Seek ten seconds"],
    ["M", "Mute or unmute"],
    ["C", "Show or hide captions"],
    ["F", "Enter full screen"],
  ];
  return `<dl class="key-grid">${shortcuts
    .map(([key, label]) => `<dt><kbd>${key}</kbd></dt><dd>${label}</dd>`)
    .join("")}</dl>`;
}

function buildBaseCsp(styles: string): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'none'",
    "font-src 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "img-src 'self' data:",
    "media-src 'self' blob:",
    "object-src 'none'",
    `script-src 'sha256-${contentHash(VIEWER_SCRIPT)}'`,
    `style-src 'sha256-${contentHash(styles)}'`,
    "worker-src 'none'",
  ].join("; ");
}

function createSecurityPolicies(
  styles: string,
  embedMode: ShareViewerConfig["embedMode"],
): ViewerSecurityPolicies {
  const documentContentSecurityPolicy = buildBaseCsp(styles);
  const sameOrigin = embedMode === "same-origin";
  const frameAncestors = sameOrigin ? "'self'" : "'none'";
  return {
    documentContentSecurityPolicy,
    responseContentSecurityPolicy: `${documentContentSecurityPolicy}; frame-ancestors ${frameAncestors}`,
    frameAncestors,
    xFrameOptions: sameOrigin ? "SAMEORIGIN" : "DENY",
  };
}

function renderMedia(input: ViewerTemplateInput): string {
  const poster = input.posterAvailable ? ` poster="./${escapeHtml(input.config.poster!)}"` : "";
  const captions = input.captionsAvailable
    ? `<track kind="captions" src="./${escapeHtml(input.config.captions)}" srclang="${escapeHtml(input.config.language)}" label="${escapeHtml(input.config.captionLabel)}" default>`
    : "";
  const videoType = input.config.video.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4";
  return `<video controls playsinline preload="metadata" data-duration-ms="${String(input.durationMs)}"${poster} aria-describedby="viewer-summary player-help demo-boundary">
    <source src="./${escapeHtml(input.config.video)}" type="${videoType}">
    ${captions}
    Your browser does not support native video playback.
  </video>`;
}

function renderPlayerTools(config: ShareViewerConfig): string {
  return `<div class="player-toolbar">
    <div class="playback-tools" aria-label="Playback tools">
      <label for="playback-rate">Speed</label>
      <select id="playback-rate" data-playback-rate>
        <option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option>
      </select>
      <button class="utility-button" type="button" data-copy-link>Copy current link</button>
    </div>
    <div class="player-primary-cta">${renderCta(config.primaryCta, "primary")}</div>
  </div>`;
}

function renderBoundary(config: ShareViewerConfig): string {
  const disclaimer = config.disclaimer
    ? `<p class="disclaimer">${escapeHtml(config.disclaimer)}</p>`
    : "";
  return `<aside class="demo-boundary" id="demo-boundary" aria-label="Demo profile and synthetic boundary">
    <div class="boundary-badges"><span class="badge">${escapeHtml(config.profile.label)}</span><span class="badge badge-synthetic">Synthetic demonstration</span></div>
    <p>${escapeHtml(config.profile.syntheticBoundary)}</p>${disclaimer}
  </aside>`;
}

function renderEndPrompt(config: ShareViewerConfig): string {
  return `<section class="end-prompt" data-end-prompt hidden aria-labelledby="end-prompt-title" aria-live="polite">
    <p class="eyebrow">Walkthrough complete</p>
    <h2 id="end-prompt-title" tabindex="-1">Ready to explore it yourself?</h2>
    <div class="end-actions">${renderCta(config.primaryCta, "primary")}<button class="utility-button" type="button" data-replay>Replay demo</button></div>
  </section>`;
}

export function createViewerDocument(input: ViewerTemplateInput): ViewerDocument {
  const styles = createViewerStyles(input.config.brand);
  const policies = createSecurityPolicies(styles, input.config.embedMode);
  const effectiveNoindex = input.config.noindex || !input.config.publicSafe;
  const brandName = input.config.brand.name ?? "Product walkthrough";
  const secondary = input.config.secondaryCta
    ? `<div class="actions">${renderCta(input.config.secondaryCta, "secondary")}</div>`
    : "";
  const duration = formatViewerTime(input.durationMs);
  const html = `<!doctype html>
<html lang="${escapeHtml(input.config.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="${effectiveNoindex ? "noindex,nofollow,noarchive" : "index,follow"}">
  <meta name="referrer" content="no-referrer">
  <meta name="theme-color" content="${input.config.brand.background}">
  <meta http-equiv="Content-Security-Policy" content="${policies.documentContentSecurityPolicy}">
  ${renderFavicon(input.config.brand.primary)}
  <title>${escapeHtml(input.title)}</title>
  <style>${styles}</style>
</head>
<body>
  <a class="skip-link" href="#demo-player">Skip to recording</a>
  <main class="shell">
    <header><p class="eyebrow">${escapeHtml(brandName)}</p><h1>${escapeHtml(input.title)}</h1><p class="summary" id="viewer-summary">${escapeHtml(input.config.summary)}</p><p class="hero-meta"><span>${duration} demo</span><span>${escapeHtml(input.config.profile.label)}</span></p></header>
    <div class="layout">
      <section class="player-card" id="demo-player" aria-label="Demo recording">
        <div class="video-wrap">${renderMedia(input)}${renderEndPrompt(input.config)}<p class="status" data-viewer-status aria-live="polite"></p></div>
        ${renderPlayerTools(input.config)}
        <div class="player-copy" id="player-help"><p>Use the native controls, choose a chapter, open a timestamped transcript cue, or copy a link to the current moment.</p></div>
        ${renderBoundary(input.config)}
      </section>
      <nav class="chapter-card" aria-label="Recording chapters"><div class="chapter-heading"><h2>Chapters</h2><span>${duration}</span></div><ol class="chapters">${renderChapters(input.chapters)}</ol></nav>
    </div>
    ${secondary}
    <div class="details-grid">
      <details class="details-card"><summary>Read transcript</summary>${renderTranscript(input.transcript)}</details>
      <details class="details-card"><summary>Keyboard shortcuts</summary>${renderKeyboardHelp()}</details>
    </div>
  </main>
  <script>${VIEWER_SCRIPT}</script>
</body>
</html>
`;
  return { html, policies };
}
