import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateShareViewer } from "../../src/share/generator.js";
import { demoSpecSchema } from "../../src/spec/schema.js";

function sha256Base64(value: string): string {
  return createHash("sha256").update(value).digest("base64");
}

function demoSpec(poster = "poster.png", embedMode: "deny" | "same-origin" = "deny") {
  return demoSpecSchema.parse({
    meta: { title: "Medication governance overview" },
    share: {
      title: "A review-ready workflow",
      summary: "Follow the evidence trail from intake to handover. <script>not executable</script>",
      profile: {
        label: "Aged Care",
        syntheticBoundary: "Synthetic demonstration data only. Not for clinical use.",
      },
      brand: { name: "Example Health", primary: "#57d6b0", background: "#101723" },
      primaryCta: { label: "Test it yourself", url: "https://demo.example.com" },
      secondaryCta: { label: "Book a call", url: "/contact" },
      poster,
      disclaimer: "Synthetic demonstration data only.",
      embedMode,
    },
    chapters: [
      {
        title: "Intake",
        steps: [{ action: "wait", timeout: 100, narration: "Open the intake queue." }],
      },
      {
        title: "Review",
        steps: [{ action: "wait", timeout: 100, narration: "Review the evidence trail." }],
      },
    ],
  });
}

describe("generateShareViewer", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), "demo-share-viewer-"));
    await writeFile(join(outputDir, "output.mp4"), "deterministic video fixture", "utf8");
    await writeFile(join(outputDir, "poster.png"), "poster fixture", "utf8");
    await writeFile(
      join(outputDir, "subtitles.vtt"),
      "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n&lt;script&gt;proof, safely escaped.\n",
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("writes a deterministic accessible viewer and integration manifest", async () => {
    const spec = demoSpec();
    const input = {
      outputDir,
      config: spec.share,
      spec,
      events: [
        { action: "wait", timestamp: 1_000, duration: 100 },
        { action: "wait", timestamp: 4_250, duration: 100 },
      ],
      startTimestamp: 1_000,
      durationMs: 8_000,
    };
    const first = await generateShareViewer(input);
    const firstHtml = await readFile(first.viewerPath, "utf8");
    const firstManifest = await readFile(first.manifestPath, "utf8");
    const second = await generateShareViewer(input);

    expect(await readFile(second.viewerPath, "utf8")).toBe(firstHtml);
    expect(await readFile(second.manifestPath, "utf8")).toBe(firstManifest);
    expect(firstHtml).toContain("<video controls playsinline");
    expect(firstHtml).toContain('<track kind="captions"');
    expect(firstHtml).toContain("prefers-reduced-motion");
    expect(firstHtml).toContain("Keyboard shortcuts");
    expect(firstHtml).toContain("Copy current link");
    expect(firstHtml).toContain("Search transcript");
    expect(firstHtml).toContain('data-transcript-start="0"');
    expect(firstHtml).toContain('id="playback-rate"');
    expect(firstHtml).toContain("Synthetic demonstration");
    expect(firstHtml).toContain("0:08 demo");
    expect(firstHtml).toContain('searchParams.set("t"');
    expect(firstHtml).toContain('rel="noopener noreferrer nofollow"');
    expect(firstHtml).toContain("&lt;script&gt;not executable&lt;/script&gt;");
    expect(firstHtml).toContain("&lt;script&gt;proof, safely escaped.");
    expect(firstHtml).not.toContain("unsafe-inline");
    expect(firstHtml).not.toContain("fetch(");
    expect(firstHtml).not.toContain("localStorage");
    expect(firstHtml).not.toContain("document.cookie");
    expect(firstHtml).not.toContain("sendBeacon");
    const script = firstHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    const styles = firstHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1];
    const csp = firstHtml.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    expect(script).toBeDefined();
    expect(styles).toBeDefined();
    expect(csp).toContain(`script-src 'sha256-${sha256Base64(script!)}'`);
    expect(csp).toContain(`style-src 'sha256-${sha256Base64(styles!)}'`);
    expect(second.manifest.publication).toMatchObject({ publicSafe: true, noindex: true });
    expect(second.manifest.durationMs).toBe(8_000);
    expect(second.manifest.profile.label).toBe("Aged Care");
    expect(second.manifest.publication.embed).toMatchObject({
      mode: "deny",
      frameAncestors: "'none'",
      requiredResponseHeaders: { "X-Frame-Options": "DENY" },
    });
    expect(
      second.manifest.publication.embed.requiredResponseHeaders["Content-Security-Policy"],
    ).toContain("frame-ancestors 'none'");
    expect(second.manifest.chapters).toEqual([
      { title: "Intake", startMs: 0 },
      { title: "Review", startMs: 3_250 },
    ]);
    expect(second.manifest.media.captions?.cueCount).toBe(1);
    expect(second.manifest.accessibility).toMatchObject({
      timestampedTranscript: true,
      transcriptSearch: true,
      copyLink: true,
      playbackRates: [0.75, 1, 1.25, 1.5, 2],
    });
    expect(second.manifest.privacy).toEqual({
      analytics: false,
      tracking: false,
      externalAssets: false,
      cookies: false,
    });
  });

  it("derives captions and transcript from reviewed narration when the video is silent", async () => {
    await rm(join(outputDir, "subtitles.vtt"));
    const spec = demoSpec();
    const input = {
      outputDir,
      config: spec.share,
      spec,
      events: [
        { action: "wait", timestamp: 1_000, duration: 100 },
        { action: "wait", timestamp: 4_250, duration: 100 },
      ],
      startTimestamp: 1_000,
      durationMs: 8_000,
    };

    const first = await generateShareViewer(input);
    const captions = await readFile(join(outputDir, "subtitles.vtt"), "utf8");
    const second = await generateShareViewer(input);

    expect(captions).toContain("00:00:00.000 --> 00:00:01.800");
    expect(captions).toContain("Open the intake queue.");
    expect(captions).toContain("00:00:03.250 --> 00:00:05.050");
    expect(captions).toContain("Review the evidence trail.");
    expect(first.manifest.media.captions?.cueCount).toBe(2);
    expect(first.manifest.accessibility.timestampedTranscript).toBe(true);
    expect(await readFile(second.manifestPath, "utf8")).toBe(
      await readFile(first.manifestPath, "utf8"),
    );
  });

  it("fails closed when required media is missing", async () => {
    const spec = demoSpec();
    await rm(join(outputDir, "output.mp4"));
    await expect(
      generateShareViewer({
        outputDir,
        config: spec.share,
        spec,
        events: [{ action: "wait", timestamp: 1_000, duration: 100 }],
        startTimestamp: 1_000,
        durationMs: 8_000,
      }),
    ).rejects.toThrow("Video not found");
  });

  it("forces noindex when the content is not asserted public-safe", async () => {
    const spec = demoSpec();
    const result = await generateShareViewer({
      outputDir,
      config: { ...spec.share, publicSafe: false, noindex: false },
      spec,
      events: [{ action: "wait", timestamp: 1_000, duration: 100 }],
      startTimestamp: 1_000,
      durationMs: 8_000,
    });
    expect(result.manifest.publication).toMatchObject({ publicSafe: false, noindex: true });
    expect(await readFile(result.viewerPath, "utf8")).toContain(
      'name="robots" content="noindex,nofollow,noarchive"',
    );
  });

  it("fails closed when an explicitly configured poster is missing", async () => {
    const spec = demoSpec("missing.png");
    await expect(
      generateShareViewer({
        outputDir,
        config: spec.share,
        spec,
        events: [{ action: "wait", timestamp: 1_000, duration: 100 }],
        startTimestamp: 1_000,
        durationMs: 8_000,
      }),
    ).rejects.toThrow("Poster not found");
  });

  it("does not follow media symlinks outside the output package", async () => {
    const externalVideo = `${outputDir}-external.mp4`;
    await writeFile(externalVideo, "external", "utf8");
    await rm(join(outputDir, "output.mp4"));
    await symlink(externalVideo, join(outputDir, "output.mp4"));
    const spec = demoSpec();
    try {
      await expect(
        generateShareViewer({
          outputDir,
          config: spec.share,
          spec,
          events: [{ action: "wait", timestamp: 1_000, duration: 100 }],
          startTimestamp: 1_000,
          durationMs: 8_000,
        }),
      ).rejects.toThrow("Video not found");
    } finally {
      await rm(externalVideo, { force: true });
    }
  });

  it("emits a same-origin response-header contract only when explicitly configured", async () => {
    const spec = demoSpec("poster.png", "same-origin");
    const result = await generateShareViewer({
      outputDir,
      config: spec.share,
      spec,
      events: [{ action: "wait", timestamp: 1_000, duration: 100 }],
      startTimestamp: 1_000,
      durationMs: 8_000,
    });
    expect(result.manifest.publication.embed).toMatchObject({
      mode: "same-origin",
      frameAncestors: "'self'",
      requiredResponseHeaders: { "X-Frame-Options": "SAMEORIGIN" },
    });
    expect(
      result.manifest.publication.embed.requiredResponseHeaders["Content-Security-Policy"],
    ).toContain("frame-ancestors 'self'");
    expect(await readFile(result.viewerPath, "utf8")).not.toContain("frame-ancestors");
  });

  it("rejects non-finite viewer durations", async () => {
    const spec = demoSpec();
    await expect(
      generateShareViewer({
        outputDir,
        config: spec.share,
        spec,
        events: [{ action: "wait", timestamp: 1_000, duration: 100 }],
        startTimestamp: 1_000,
        durationMs: Number.NaN,
      }),
    ).rejects.toThrow("Viewer duration");
  });

  it("rejects chapter timings beyond the rendered video duration", async () => {
    const spec = demoSpec();
    await expect(
      generateShareViewer({
        outputDir,
        config: spec.share,
        spec,
        events: [
          { action: "wait", timestamp: 1_000, duration: 100 },
          { action: "wait", timestamp: 10_000, duration: 100 },
        ],
        startTimestamp: 1_000,
        durationMs: 8_000,
      }),
    ).rejects.toThrow("chapter timing");
  });
});
