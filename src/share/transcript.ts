const MAX_CUES = 5_000;
const MAX_CUE_TEXT = 2_000;

export interface TranscriptCue {
  startMs: number;
  endMs: number;
  text: string;
}

function parseTimestamp(value: string): number | undefined {
  const fields = value.trim().split(":");
  if (fields.length < 2 || fields.length > 3) return undefined;
  const seconds = Number(fields.pop());
  const minutes = Number(fields.pop());
  const hours = fields.length === 1 ? Number(fields[0]) : 0;
  if (![seconds, minutes, hours].every(Number.isFinite)) return undefined;
  return Math.round((hours * 3_600 + minutes * 60 + seconds) * 1_000);
}

function decodeVttText(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCueBlock(block: string): TranscriptCue | undefined {
  const lines = block.split("\n").map((line) => line.trim());
  const timingIndex = lines.findIndex((line) => line.includes("-->"));
  if (timingIndex < 0) return undefined;
  const timing = lines[timingIndex]!.split("-->");
  const startMs = parseTimestamp(timing[0] ?? "");
  const endToken = (timing[1] ?? "").trim().split(/\s+/)[0] ?? "";
  const endMs = parseTimestamp(endToken);
  const text = decodeVttText(lines.slice(timingIndex + 1).join(" "));
  if (startMs === undefined || endMs === undefined || endMs < startMs || text.length === 0) {
    return undefined;
  }
  if (text.length > MAX_CUE_TEXT) {
    throw new Error(`Caption cue exceeds ${String(MAX_CUE_TEXT)} characters`);
  }
  return { startMs, endMs, text };
}

export function parseVttTranscript(input: string): TranscriptCue[] {
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("WEBVTT")) {
    throw new Error("Captions must be a valid WEBVTT file");
  }
  const blocks = normalized.split(/\n{2,}/).slice(1);
  const cues = blocks
    .filter((block) => !/^(?:NOTE|STYLE|REGION)(?:\s|$)/.test(block.trim()))
    .map(parseCueBlock)
    .filter((cue): cue is TranscriptCue => cue !== undefined);
  if (cues.length > MAX_CUES) {
    throw new Error(`Captions exceed ${String(MAX_CUES)} cues`);
  }
  return cues;
}
