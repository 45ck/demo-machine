import { describe, expect, it } from "vitest";
import { prepareNarrationTiming } from "../../src/cli/capture-runtime.js";
import type { NarrationSettings } from "../../src/cli/narration.js";
import type { DemoSpec } from "../../src/spec/types.js";

function narratedSpec(): DemoSpec {
  return {
    meta: { title: "Narrated demo", resolution: { width: 1440, height: 810 } },
    runner: { url: "http://localhost:3000", timeout: 30000 },
    chapters: [
      {
        title: "Chapter",
        steps: [{ action: "click", selector: "#one", narration: "Expected narration." }],
      },
    ],
  } as DemoSpec;
}

describe("prepareNarrationTiming", () => {
  it("propagates provider errors instead of returning estimated timing", async () => {
    const settings: NarrationSettings = {
      enabled: true,
      provider: "missing-provider",
      syncMode: "auto-sync",
      bufferMs: 500,
    };

    await expect(
      prepareNarrationTiming({ spec: narratedSpec(), settings, outputDir: "/tmp/demo-machine" }),
    ).rejects.toThrow('Unknown TTS provider: "missing-provider"');
  });
});
