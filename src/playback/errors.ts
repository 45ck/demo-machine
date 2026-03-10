import type { Step } from "../spec/types.js";
import type { ActionEvent } from "./types.js";

export class PlaybackStepError extends Error {
  public readonly stepIndex: number;
  public readonly chapterTitle: string;
  public readonly step: Step;
  public readonly selectorForEvent: string;
  public readonly events: ActionEvent[];
  public readonly startTimestamp: number;

  constructor(params: {
    stepIndex: number;
    chapterTitle: string;
    step: Step;
    selectorForEvent: string;
    events: ActionEvent[];
    startTimestamp: number;
    cause: unknown;
  }) {
    super(
      `Playback failed at step ${String(params.stepIndex)} (${params.chapterTitle}): ${params.step.action} ${params.selectorForEvent}`,
      { cause: params.cause },
    );
    this.name = "PlaybackStepError";
    this.stepIndex = params.stepIndex;
    this.chapterTitle = params.chapterTitle;
    this.step = params.step;
    this.selectorForEvent = params.selectorForEvent;
    this.events = params.events;
    this.startTimestamp = params.startTimestamp;
  }
}
