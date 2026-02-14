export interface NarrationSegment {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TTSOptions {
  voice?: string;
  speed?: number;
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
