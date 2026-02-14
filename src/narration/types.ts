export interface NarrationSegment {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TTSOptions {
  voice?: string;
  speed?: number;
  model?: string;
  voiceSettings?: ElevenLabsVoiceSettings;
  outputFormat?: string;
}

export interface ElevenLabsVoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

export interface TTSProvider {
  name: string;
  synthesize(text: string, options: TTSOptions): Promise<Buffer>;
}

export interface SubtitleEntry {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface NarrationMixResult {
  audioPath: string;
  segments: TimedNarrationSegment[];
  totalDurationMs: number;
}

export interface TimedNarrationSegment {
  text: string;
  startMs: number;
  durationMs: number;
}
