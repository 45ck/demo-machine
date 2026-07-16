import type { ActionEvent } from "../playback/types.js";
import type { DemoSpec } from "../spec/types.js";

export interface ViewerChapter {
  title: string;
  startMs: number;
}

export function deriveViewerChapters(params: {
  spec: DemoSpec;
  events: ActionEvent[];
  startTimestamp: number;
}): ViewerChapter[] {
  const chapters: ViewerChapter[] = [];
  let eventIndex = 0;

  for (const chapter of params.spec.chapters) {
    const event = params.events[eventIndex];
    if (!event) break;
    chapters.push({
      title: chapter.title,
      startMs: Math.max(0, Math.round(event.timestamp - params.startTimestamp)),
    });
    eventIndex += chapter.steps.length;
  }

  return chapters;
}

export function formatViewerTime(timeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(timeMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours)}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}
