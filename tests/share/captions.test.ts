import { describe, expect, it } from "vitest";
import { demoSpecSchema } from "../../src/spec/schema.js";
import { deriveReviewedSpecCaptions } from "../../src/share/captions.js";

describe("deriveReviewedSpecCaptions", () => {
  it("maps reviewed step narration onto the captured timeline without TTS", () => {
    const spec = demoSpecSchema.parse({
      meta: { title: "Silent product demo" },
      chapters: [
        {
          title: "Review",
          steps: [
            { action: "wait", timeout: 100, narration: "Open the reviewed workflow." },
            { action: "wait", timeout: 100 },
            {
              action: "wait",
              timeout: 100,
              narration: "Confirm the persisted evidence in the final state.",
            },
          ],
        },
      ],
    });

    expect(
      deriveReviewedSpecCaptions({
        spec,
        events: [
          { action: "wait", timestamp: 5_000, duration: 100 },
          { action: "wait", timestamp: 6_000, duration: 100 },
          { action: "wait", timestamp: 8_000, duration: 100 },
        ],
        startTimestamp: 5_000,
        durationMs: 7_000,
      }),
    ).toEqual([
      { text: "Open the reviewed workflow.", startMs: 0, endMs: 1_800 },
      {
        text: "Confirm the persisted evidence in the final state.",
        startMs: 3_000,
        endMs: 5_400,
      },
    ]);
  });

  it("clamps cues to the rendered duration and omits steps without narration", () => {
    const spec = demoSpecSchema.parse({
      meta: { title: "Bounded captions" },
      chapters: [
        {
          title: "Review",
          steps: [
            { action: "wait", timeout: 100 },
            { action: "wait", timeout: 100, narration: "A final reviewed line." },
          ],
        },
      ],
    });

    expect(
      deriveReviewedSpecCaptions({
        spec,
        events: [
          { action: "wait", timestamp: 1_000, duration: 100 },
          { action: "wait", timestamp: 4_900, duration: 500 },
        ],
        startTimestamp: 1_000,
        durationMs: 4_000,
      }),
    ).toEqual([{ text: "A final reviewed line.", startMs: 3_900, endMs: 4_000 }]);
  });
});
