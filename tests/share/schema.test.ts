import { describe, expect, it } from "vitest";
import { demoSpecSchema } from "../../src/spec/schema.js";
import { isSafeCtaUrl, shareViewerConfigSchema } from "../../src/spec/share-schema.js";

function validShare() {
  return {
    summary: "See the workflow from intake to a review-ready result.",
    profile: {
      label: "Aged Care",
      syntheticBoundary: "Synthetic demonstration data only. Not for clinical use.",
    },
    primaryCta: { label: "Test it yourself", url: "https://demo.example.com" },
  };
}

describe("shareViewerConfigSchema", () => {
  it("applies private-by-default viewer and media settings", () => {
    const share = shareViewerConfigSchema.parse(validShare());
    expect(share).toMatchObject({
      enabled: true,
      noindex: true,
      publicSafe: true,
      embedMode: "deny",
      video: "output.mp4",
      captions: "subtitles.vtt",
      language: "en",
    });
    expect(share.brand).toEqual({ primary: "#4f8cff", background: "#0d0f14" });
  });

  it.each([
    "https://demo.example.com/path",
    "http://localhost:3000/demo",
    "http://127.0.0.1:8788/",
    "http://[::1]:4173/",
    "/products/demo",
    "./viewer.html",
  ])("accepts a secure or local CTA: %s", (url) => {
    expect(isSafeCtaUrl(url)).toBe(true);
  });

  it.each([
    "http://example.com",
    "https://user:password@example.com",
    "javascript:alert(1)",
    "data:text/html,hello",
    "//example.com/demo",
    "../private/viewer.html",
    "./../private/viewer.html",
    "/../private/viewer.html",
    "/%2e%2e/private/viewer.html",
    "/safe/%2e%2e%5c" + "private/viewer.html",
    "/safe/%0a" + "private/viewer.html",
  ])("rejects an unsafe CTA: %s", (url) => {
    expect(
      shareViewerConfigSchema.safeParse({ ...validShare(), primaryCta: { label: "Go", url } })
        .success,
    ).toBe(false);
  });

  it("rejects oversized viewer copy and unsafe asset paths", () => {
    expect(
      shareViewerConfigSchema.safeParse({ ...validShare(), title: "x".repeat(121) }).success,
    ).toBe(false);
    expect(
      shareViewerConfigSchema.safeParse({ ...validShare(), summary: "x".repeat(801) }).success,
    ).toBe(false);
    expect(
      shareViewerConfigSchema.safeParse({ ...validShare(), video: "../output.mp4" }).success,
    ).toBe(false);
    expect(
      shareViewerConfigSchema.safeParse({ ...validShare(), poster: "nested/poster.png" }).success,
    ).toBe(false);
  });

  it("requires a bounded profile and synthetic boundary", () => {
    const { profile: _profile, ...withoutProfile } = validShare();
    expect(shareViewerConfigSchema.safeParse(withoutProfile).success).toBe(false);
    expect(
      shareViewerConfigSchema.safeParse({
        ...validShare(),
        profile: { label: "Aged Care", syntheticBoundary: "x".repeat(301) },
      }).success,
    ).toBe(false);
  });

  it("permits same-origin embedding only when explicitly selected", () => {
    expect(shareViewerConfigSchema.parse(validShare()).embedMode).toBe("deny");
    expect(
      shareViewerConfigSchema.parse({ ...validShare(), embedMode: "same-origin" }).embedMode,
    ).toBe("same-origin");
    expect(
      shareViewerConfigSchema.safeParse({ ...validShare(), embedMode: "anywhere" }).success,
    ).toBe(false);
  });

  it("is validated as part of a demo spec", () => {
    const spec = demoSpecSchema.parse({
      meta: { title: "Shareable flow" },
      share: {
        ...validShare(),
        secondaryCta: { label: "Book a call", url: "/contact" },
      },
      chapters: [{ title: "Start", steps: [{ action: "wait", timeout: 100 }] }],
    });
    expect(spec.share?.primaryCta.label).toBe("Test it yourself");
    expect(spec.share?.secondaryCta?.url).toBe("/contact");
  });
});
