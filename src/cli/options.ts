import { setLogLevel } from "../utils/logger.js";
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
}

export function applyGlobalOptions(opts: GlobalOptions): void {
  if (opts.verbose) {
    setLogLevel("debug");
  }
}
