import { setLogLevel } from "../utils/logger.js";
import type { ChangeDetectionMode } from "../playback/change-detection/types.js";
import type { SelectApproach } from "../playback/handlers/select-approaches.js";

export interface GlobalOptions {
  output: string;
  narration: boolean;
  edit: boolean;
  renderer: string;
  ttsProvider: string;
  ttsVoice?: string | undefined;
  narrationSync: string;
  narrationBuffer: number;
  verbose: boolean;
  headless: boolean;
  strictGeometry: boolean;
  fromChapter?: string | undefined;
  fromStep?: number | undefined;
  trimStartMs: number;
  resolutionOverride?: { width: number; height: number } | undefined;
  changeDetection?: ChangeDetectionMode | undefined;
  selectApproach?: SelectApproach | undefined;
  timeline: boolean;
}

export function applyGlobalOptions(opts: GlobalOptions): void {
  if (opts.verbose) {
    setLogLevel("debug");
  }
  if (opts.selectApproach) {
    process.env["DM_SELECT_APPROACH"] = opts.selectApproach;
  }
}
