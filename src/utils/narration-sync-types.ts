export type NarrationSyncMode = "auto-sync" | "manual" | "warn-only";

export interface NarrationSyncConfig {
  mode: NarrationSyncMode;
  bufferMs: number;
}

export interface SpecNarrationConfig {
  enabled?: boolean | undefined;
  provider?: string | undefined;
  voice?: string | undefined;
  sync?: Partial<NarrationSyncConfig> | undefined;
}

export interface NarrationTimingEntry {
  text: string;
  durationMs: number;
  audioPath?: string | undefined;
}

export type NarrationTimingMap = Map<number, NarrationTimingEntry>;

export interface NarrationPreSynthesisResult {
  timing: NarrationTimingMap;
  providerName: string;
  outputDir: string;
}
