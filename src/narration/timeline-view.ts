import {
  computeLayout,
  renderRuler,
  renderChapterTrack,
  renderActionTrack,
  renderNarrationTrack,
  renderOverlapWarnings,
  colorize,
  ANSI,
} from "./timeline-render.js";

/** Overlap between two narration segments. */
export interface OverlapInfo {
  indexA: number;
  indexB: number;
  overlapMs: number;
}

/** Input for timeline rendering. */
export interface TimelineViewInput {
  events: Array<{ timestamp: number; action?: string }>;
  narrationSegments: Array<{ startMs: number; endMs: number; text?: string }>;
  chapters?: Array<{ title: string; startMs: number; endMs: number }> | undefined;
  totalDurationMs: number;
}

/** Result from renderTimelineView. */
export interface TimelineViewResult {
  output: string;
  overlaps: OverlapInfo[];
}

/** Error thrown when narration segments overlap. */
export class NarrationOverlapError extends Error {
  public readonly overlaps: OverlapInfo[];
  constructor(overlaps: OverlapInfo[], summary: string) {
    super(summary);
    this.name = "NarrationOverlapError";
    this.overlaps = overlaps;
  }
}

/** Detect pairwise overlaps among narration segments. O(n log n). */
export function detectOverlaps(segments: Array<{ startMs: number; endMs: number }>): OverlapInfo[] {
  if (segments.length < 2) return [];
  const indexed = segments.map((s, i) => ({ ...s, originalIndex: i }));
  indexed.sort((a, b) => a.startMs - b.startMs);
  const overlaps: OverlapInfo[] = [];
  for (let i = 0; i < indexed.length - 1; i++) {
    const curr = indexed[i]!;
    const next = indexed[i + 1]!;
    if (curr.endMs > next.startMs) {
      overlaps.push({
        indexA: curr.originalIndex,
        indexB: next.originalIndex,
        overlapMs: curr.endMs - next.startMs,
      });
    }
  }
  return overlaps;
}

/** Format milliseconds as human-readable time string. */
export function formatTimeSeconds(ms: number): string {
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec - mins * 60;
  return `${mins}m ${secs.toFixed(0)}s`;
}

/** Build timeline input from events, segments, and optional spec. */
export function buildTimelineViewInput(
  events: Array<{ timestamp: number; action?: string }>,
  segments: Array<{ startMs: number; endMs: number; text?: string }>,
  spec?: { chapters?: Array<{ title: string }> },
  totalMs?: number,
): TimelineViewInput {
  const lastEventMs = events.length > 0 ? Math.max(...events.map((e) => e.timestamp)) : 0;
  const lastSegMs = segments.length > 0 ? Math.max(...segments.map((s) => s.endMs)) : 0;
  const duration = totalMs ?? Math.max(lastEventMs, lastSegMs, 1);

  return { events, narrationSegments: segments, totalDurationMs: duration };
}

/** Render a full timeline view as a string. */
export function renderTimelineView(
  input: TimelineViewInput,
  opts?: { width?: number; color?: boolean },
): TimelineViewResult {
  const width = opts?.width ?? 120;
  const useColor = opts?.color ?? true;
  const pad = "        ";

  const layout = computeLayout(input.totalDurationMs, width);
  const ruler = renderRuler(layout);
  const overlaps = detectOverlaps(input.narrationSegments);
  const overlapRanges = overlaps.map((o) => {
    const a = input.narrationSegments[o.indexA]!;
    const b = input.narrationSegments[o.indexB]!;
    return { startMs: b.startMs, endMs: Math.min(a.endMs, b.endMs) };
  });

  const lines: string[] = [];
  lines.push("");
  lines.push(`${pad}${colorize(ruler.ticks, ANSI.dim, useColor)}`);

  if (input.chapters) {
    lines.push(
      `${"  Chap  "}${colorize(renderChapterTrack(input.chapters, layout), ANSI.yellow, useColor)}`,
    );
    lines.push("");
  }
  lines.push(
    `${"  Acts  "}${colorize(renderActionTrack(input.events, layout), ANSI.cyan, useColor)}`,
  );
  lines.push("");
  // cspell:ignore Narr
  lines.push(
    `${"  Narr  "}${renderNarrationTrack(input.narrationSegments, layout, overlapRanges, useColor)}`,
  );
  lines.push("");
  lines.push(`${pad}${colorize(ruler.labels, ANSI.dim, useColor)}`);
  lines.push("");

  if (overlaps.length > 0) {
    lines.push(...renderOverlapWarnings(overlaps, input.narrationSegments, useColor));
  }

  const plural = overlaps.length !== 1 ? "s" : "";
  if (overlaps.length > 0) {
    lines.push("");
    lines.push(
      colorize(
        `  ${overlaps.length} overlap${plural} detected — narration segments must not overlap`,
        ANSI.red,
        useColor,
      ),
    );
  }

  return { output: lines.join("\n"), overlaps };
}
