import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { preSynthesizeNarration } from "../../src/narration/pre-synthesizer.js";
import type { DemoSpec } from "../../src/spec/types.js";
import type { TTSProvider } from "../../src/narration/types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function narratedSpec(): DemoSpec {
  return {
    meta: { title: "Narrated demo", resolution: { width: 1440, height: 810 } },
    runner: { url: "http://localhost:3000", timeout: 30000 },
    chapters: [
      {
        title: "Chapter",
        steps: [
          { action: "click", selector: "#one", narration: "First expected segment." },
          { action: "click", selector: "#two", narration: "Second expected segment." },
        ],
      },
    ],
  } as DemoSpec;
}

function emptyPcmWav(): Buffer {
  const wav = Buffer.alloc(44);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24_000, 24);
  wav.writeUInt32LE(48_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(0, 40);
  return wav;
}

describe("preSynthesizeNarration", () => {
  it("fails closed when any expected narration segment has no audio", async () => {
    const dir = await mkdtemp(join(tmpdir(), "demo-machine-narration-"));
    tempDirs.push(dir);
    const provider: TTSProvider = {
      name: "test-tts",
      synthesize: vi
        .fn<(text: string) => Promise<Buffer>>()
        .mockRejectedValueOnce(new Error("offline model failed")),
    };

    await expect(preSynthesizeNarration(narratedSpec(), provider, {}, dir)).rejects.toThrow(
      "Failed to synthesize complete narration",
    );
  });

  it("rejects an unrecognizable audio payload instead of estimating its duration", async () => {
    const dir = await mkdtemp(join(tmpdir(), "demo-machine-narration-"));
    tempDirs.push(dir);
    const provider: TTSProvider = {
      name: "test-tts",
      synthesize: vi.fn().mockResolvedValue(Buffer.from("not-audio")),
    };

    await expect(preSynthesizeNarration(narratedSpec(), provider, {}, dir)).rejects.toThrow(
      "unsupported or unrecognizable audio payload",
    );
  });

  it("rejects a recognized WAV payload with no audio frames", async () => {
    const dir = await mkdtemp(join(tmpdir(), "demo-machine-narration-"));
    tempDirs.push(dir);
    const provider: TTSProvider = {
      name: "test-tts",
      synthesize: vi.fn().mockResolvedValue(emptyPcmWav()),
    };

    await expect(preSynthesizeNarration(narratedSpec(), provider, {}, dir)).rejects.toThrow(
      "Failed to synthesize complete narration",
    );
  });
});
