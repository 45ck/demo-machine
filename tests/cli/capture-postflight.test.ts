import { writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runPostflight } from "../../src/cli/capture-postflight.js";

describe("capture postflight", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `demo-machine-postflight-${String(Date.now())}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function writeSuccessfulArtifacts(): Promise<void> {
    const videoPath = join(tempDir, "video.webm");
    const tracePath = join(tempDir, "trace.zip");
    const eventLogPath = join(tempDir, "events.json");
    const metadataPath = join(tempDir, "metadata.json");
    const environmentPath = join(tempDir, "environment.json");
    const verificationPath = join(tempDir, "verification.json");
    await writeFile(videoPath, "video");
    await writeFile(tracePath, "trace");
    await writeFile(eventLogPath, "[]");
    await writeFile(metadataPath, "{}");
    await writeFile(environmentPath, "{}");
    await writeFile(
      verificationPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          status: "passed",
          artifacts: {
            videoPath,
            tracePath,
            eventLogPath,
            metadataPath,
            environmentPath,
            verificationPath,
          },
          checks: { requiredArtifactsPresent: true },
        },
        null,
        2,
      ),
    );
  }

  it("passes when required post-capture checks pass", async () => {
    await writeSuccessfulArtifacts();

    await expect(
      runPostflight({
        spec: {
          chapters: [{ title: "Intro", steps: [{ action: "navigate", url: "/" }] }],
        },
        events: [{ action: "navigate", timestamp: 1, duration: 2 }],
        opts: { output: tempDir },
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects when post-capture verification fails", async () => {
    await expect(
      runPostflight({
        spec: {
          chapters: [{ title: "Intro", steps: [{ action: "navigate", url: "/" }] }],
        },
        events: [],
        opts: { output: tempDir },
      }),
    ).rejects.toThrow("Postflight verification failed");
  });

  it("rejects when verification.json reports missing required artifacts", async () => {
    const videoPath = join(tempDir, "video.webm");
    const tracePath = join(tempDir, "trace.zip");
    const eventLogPath = join(tempDir, "events.json");
    const environmentPath = join(tempDir, "environment.json");
    const verificationPath = join(tempDir, "verification.json");
    await writeFile(videoPath, "video");
    await writeFile(tracePath, "trace");
    await writeFile(eventLogPath, "[]");
    await writeFile(environmentPath, "{}");
    await writeFile(
      verificationPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          status: "passed",
          artifacts: {
            videoPath,
            tracePath,
            eventLogPath,
            metadataPath: join(tempDir, "missing-metadata.json"),
            environmentPath,
            verificationPath,
          },
          checks: {
            requiredArtifactsPresent: false,
            missingRequiredArtifacts: ["metadataPath"],
          },
        },
        null,
        2,
      ),
    );

    await expect(
      runPostflight({
        spec: {
          chapters: [{ title: "Intro", steps: [{ action: "navigate", url: "/" }] }],
        },
        events: [{ action: "navigate", timestamp: 1, duration: 2 }],
        opts: { output: tempDir },
      }),
    ).rejects.toThrow(/requiredArtifactsPresent=false.*metadataPath/);
  });
});
