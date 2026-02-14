import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VoiceEntry } from "../../src/narration/voice-config.js";

const mockFs: Record<string, string> = {};

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async (path: string) => {
    const content = mockFs[path];
    if (content !== undefined) return content;
    throw new Error("ENOENT");
  }),
  writeFile: vi.fn(async (path: string, content: string) => {
    mockFs[path] = content;
  }),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:os", () => ({
  homedir: () => "/home/test",
}));

describe("voice-config", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockFs)) {
      delete mockFs[key];
    }
  });

  it("returns empty config when no file exists", async () => {
    const { loadVoiceConfig } = await import("../../src/narration/voice-config.js");
    const config = await loadVoiceConfig();
    expect(config.voices).toEqual([]);
  });

  it("saves and loads voice entries", async () => {
    const { saveVoiceEntry, loadVoiceConfig } = await import("../../src/narration/voice-config.js");

    const entry: VoiceEntry = {
      name: "test-voice",
      voiceId: "voice-123",
      provider: "elevenlabs",
      createdAt: "2025-01-01T00:00:00Z",
    };

    await saveVoiceEntry(entry);
    const config = await loadVoiceConfig();
    expect(config.voices).toHaveLength(1);
    expect(config.voices[0]!.name).toBe("test-voice");
  });

  it("overwrites existing entry with same name", async () => {
    const { saveVoiceEntry, loadVoiceConfig } = await import("../../src/narration/voice-config.js");

    await saveVoiceEntry({
      name: "test-voice",
      voiceId: "voice-123",
      provider: "elevenlabs",
      createdAt: "2025-01-01T00:00:00Z",
    });

    await saveVoiceEntry({
      name: "test-voice",
      voiceId: "voice-456",
      provider: "elevenlabs",
      createdAt: "2025-01-02T00:00:00Z",
    });

    const config = await loadVoiceConfig();
    expect(config.voices).toHaveLength(1);
    expect(config.voices[0]!.voiceId).toBe("voice-456");
  });

  it("lists voices from config", async () => {
    const { saveVoiceEntry, listVoices } = await import("../../src/narration/voice-config.js");

    await saveVoiceEntry({
      name: "voice-a",
      voiceId: "a-123",
      provider: "elevenlabs",
      createdAt: "2025-01-01T00:00:00Z",
    });

    const voices = await listVoices();
    expect(voices).toHaveLength(1);
    expect(voices[0]!.name).toBe("voice-a");
  });
});
