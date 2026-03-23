/** ANSI color codes. */
export const ANSI = {
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
} as const;

export interface TimelineLayout {
  totalMs: number;
  cols: number;
  msPerCol: number;
}

export function computeLayout(totalMs: number, cols: number): TimelineLayout {
  return { totalMs, cols, msPerCol: totalMs / cols };
}

export function msToCol(ms: number, layout: TimelineLayout): number {
  return Math.min(Math.round(ms / layout.msPerCol), layout.cols - 1);
}

export function colorize(text: string, code: string, useColor: boolean): string {
  return useColor ? `${code}${text}${ANSI.reset}` : text;
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

export function pickRulerInterval(layout: TimelineLayout): number {
  const targetTicks = Math.floor(layout.cols / 12);
  const intervals = [500, 1000, 2000, 5000, 10000, 30000, 60000];
  for (const iv of intervals) {
    if (layout.totalMs / iv <= targetTicks) return iv;
  }
  return intervals[intervals.length - 1] ?? 60000;
}

export function renderRuler(layout: TimelineLayout): { ticks: string; labels: string } {
  const interval = pickRulerInterval(layout);
  const ticks = Array(layout.cols).fill(" ");
  const labels = Array(layout.cols).fill(" ");
  for (let ms = 0; ms <= layout.totalMs; ms += interval) {
    const col = msToCol(ms, layout);
    if (col < layout.cols) {
      ticks[col] = "│";
      const label = `${(ms / 1000).toFixed(1)}s`;
      for (let i = 0; i < label.length && col + i < layout.cols; i++) {
        labels[col + i] = label[i];
      }
    }
  }
  return { ticks: ticks.join(""), labels: labels.join("") };
}

export function renderChapterTrack(
  chapters: Array<{ title: string; startMs: number; endMs: number }>,
  layout: TimelineLayout,
): string {
  const track = Array(layout.cols).fill(" ");
  for (const ch of chapters) {
    const start = msToCol(ch.startMs, layout);
    const end = msToCol(ch.endMs, layout);
    for (let i = start; i <= end && i < layout.cols; i++) track[i] = "█";
  }
  return track.join("");
}

export function renderActionTrack(
  events: Array<{ timestamp: number }>,
  layout: TimelineLayout,
): string {
  const track = Array(layout.cols).fill(" ");
  for (const ev of events) {
    const col = msToCol(ev.timestamp, layout);
    if (col < layout.cols) track[col] = "▌";
  }
  return track.join("");
}

export function renderNarrationTrack(
  segments: Array<{ startMs: number; endMs: number }>,
  layout: TimelineLayout,
  overlapRanges: Array<{ startMs: number; endMs: number }>,
  useColor: boolean,
): string {
  const track = Array(layout.cols).fill(" ");
  for (const seg of segments) {
    const start = msToCol(seg.startMs, layout);
    const end = msToCol(seg.endMs, layout);
    for (let i = start; i <= end && i < layout.cols; i++) track[i] = "█";
  }
  let result = track.join("");
  if (useColor) {
    result = colorize(result, ANSI.green, true);
  }
  return result;
}

export function renderOverlapWarnings(
  overlaps: Array<{ indexA: number; indexB: number; overlapMs: number }>,
  segments: Array<{ startMs: number; endMs: number }>,
  useColor: boolean,
): string[] {
  return overlaps.map((o) => {
    const msg = `  ⚠ Overlap: segment ${o.indexA} ↔ ${o.indexB} (${o.overlapMs.toFixed(0)}ms)`;
    return useColor ? colorize(msg, ANSI.red, true) : msg;
  });
}
