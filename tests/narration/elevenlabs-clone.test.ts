import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("fake audio data")),
}));

describe("cloneVoice", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env["ELEVENLABS_API_KEY"];

  beforeEach(() => {
    process.env["ELEVENLABS_API_KEY"] = "test-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env["ELEVENLABS_API_KEY"] = originalEnv;
    } else {
      delete process.env["ELEVENLABS_API_KEY"];
    }
  });

  it("sends clone request to ElevenLabs API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ voice_id: "cloned-123" }),
    });

    const { cloneVoice } = await import("../../src/narration/providers/elevenlabs-clone.js");
    const result = await cloneVoice({
      name: "My Voice",
      files: ["/tmp/sample.mp3"],
    });

    expect(result.voiceId).toBe("cloned-123");
    expect(result.name).toBe("My Voice");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/voices/add",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws when API key is missing", async () => {
    delete process.env["ELEVENLABS_API_KEY"];
    const { cloneVoice } = await import("../../src/narration/providers/elevenlabs-clone.js");
    await expect(cloneVoice({ name: "Test", files: ["/tmp/sample.mp3"] })).rejects.toThrow(
      "ELEVENLABS_API_KEY",
    );
  });

  it("throws when no files provided", async () => {
    const { cloneVoice } = await import("../../src/narration/providers/elevenlabs-clone.js");
    await expect(cloneVoice({ name: "Test", files: [] })).rejects.toThrow(
      "At least one audio file",
    );
  });

  it("throws on API error response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Bad Request"),
    });

    const { cloneVoice } = await import("../../src/narration/providers/elevenlabs-clone.js");
    await expect(cloneVoice({ name: "Test", files: ["/tmp/sample.mp3"] })).rejects.toThrow(
      "voice cloning failed",
    );
  });
});
