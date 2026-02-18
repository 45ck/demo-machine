import type { NarrationSegment, SubtitleEntry, TimedNarrationSegment } from "./types.js";

function padStart(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

export function formatTimestamp(ms: number, format: "vtt" | "srt"): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;

  const separator = format === "vtt" ? "." : ",";
  return `${padStart(hours, 2)}:${padStart(minutes, 2)}:${padStart(seconds, 2)}${separator}${padStart(millis, 3)}`;
}

function toSubtitleEntries(segments: NarrationSegment[]): SubtitleEntry[] {
  return segments.map((seg, i) => ({
    index: i + 1,
    startMs: seg.startMs,
    endMs: seg.endMs,
    text: seg.text,
  }));
}

function toSubtitleEntriesFromTimed(segments: TimedNarrationSegment[]): SubtitleEntry[] {
  return segments.map((seg, i) => ({
    index: i + 1,
    startMs: seg.startMs,
    endMs: seg.startMs + seg.durationMs,
    text: seg.text,
  }));
}

export function generateVTT(segments: NarrationSegment[]): string {
  const entries = toSubtitleEntries(segments);
  const lines = ["WEBVTT", ""];

  for (const entry of entries) {
    const start = formatTimestamp(entry.startMs, "vtt");
    const end = formatTimestamp(entry.endMs, "vtt");
    lines.push(String(entry.index));
    lines.push(`${start} --> ${end}`);
    lines.push(entry.text);
    lines.push("");
  }

  return lines.join("\n");
}

export function generateSRT(segments: NarrationSegment[]): string {
  const entries = toSubtitleEntries(segments);
  const lines: string[] = [];

  for (const entry of entries) {
    const start = formatTimestamp(entry.startMs, "srt");
    const end = formatTimestamp(entry.endMs, "srt");
    lines.push(String(entry.index));
    lines.push(`${start} --> ${end}`);
    lines.push(entry.text);
    lines.push("");
  }

  return lines.join("\n");
}

export function generateVTTFromTimed(segments: TimedNarrationSegment[]): string {
  const entries = toSubtitleEntriesFromTimed(segments);
  const lines = ["WEBVTT", ""];

  for (const entry of entries) {
    const start = formatTimestamp(entry.startMs, "vtt");
    const end = formatTimestamp(entry.endMs, "vtt");
    lines.push(String(entry.index));
    lines.push(`${start} --> ${end}`);
    lines.push(entry.text);
    lines.push("");
  }

  return lines.join("\n");
}

export function generateSRTFromTimed(segments: TimedNarrationSegment[]): string {
  const entries = toSubtitleEntriesFromTimed(segments);
  const lines: string[] = [];

  for (const entry of entries) {
    const start = formatTimestamp(entry.startMs, "srt");
    const end = formatTimestamp(entry.endMs, "srt");
    lines.push(String(entry.index));
    lines.push(`${start} --> ${end}`);
    lines.push(entry.text);
    lines.push("");
  }

  return lines.join("\n");
}
