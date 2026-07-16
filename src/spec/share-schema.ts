import { z } from "zod";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const siblingFilePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isSafeLocalCta(value: string): boolean {
  if ((!value.startsWith("/") && !value.startsWith("./")) || value.startsWith("//")) {
    return false;
  }
  if (value.includes("\\") || [...value].some((character) => character.charCodeAt(0) < 32)) {
    return false;
  }
  try {
    const pathname = decodeURIComponent(value.split(/[?#]/, 1)[0] ?? "");
    if (
      pathname.includes("\\") ||
      [...pathname].some((character) => character.charCodeAt(0) < 32)
    ) {
      return false;
    }
    return !pathname.split("/").includes("..");
  } catch {
    return false;
  }
}

export function isSafeCtaUrl(value: string): boolean {
  if (isSafeLocalCta(value)) return true;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return false;
    if (parsed.protocol === "https:") return true;
    return parsed.protocol === "http:" && loopbackHosts.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function isSafeSiblingFile(value: string): boolean {
  return siblingFilePattern.test(value) && !value.includes("..");
}

const boundedText = (label: string, maximum: number) =>
  z.string().trim().min(1, `${label} is required`).max(maximum, `${label} is too long`);

const siblingFile = (label: string, extensions: readonly string[]) =>
  boundedText(label, 128)
    .refine(isSafeSiblingFile, `${label} must be a sibling filename without path traversal`)
    .refine(
      (value) => extensions.some((extension) => value.toLowerCase().endsWith(extension)),
      `${label} must use one of: ${extensions.join(", ")}`,
    );

export const shareCtaSchema = z.object({
  label: boundedText("CTA label", 60),
  url: boundedText("CTA URL", 2_048).refine(
    isSafeCtaUrl,
    "CTA URL must be HTTPS, a loopback HTTP URL, or a safe same-origin path",
  ),
});

export const shareViewerConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  title: boundedText("Viewer title", 120).optional(),
  summary: boundedText("Viewer summary", 800),
  profile: z.object({
    label: boundedText("Demo profile label", 80),
    syntheticBoundary: boundedText("Synthetic boundary", 300),
  }),
  brand: z
    .object({
      name: boundedText("Brand name", 80).optional(),
      primary: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Brand primary must be a six-digit hex colour")
        .optional()
        .default("#4f8cff"),
      background: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Brand background must be a six-digit hex colour")
        .optional()
        .default("#0d0f14"),
    })
    .optional()
    .default({ primary: "#4f8cff", background: "#0d0f14" }),
  primaryCta: shareCtaSchema,
  secondaryCta: shareCtaSchema.optional(),
  video: siblingFile("Video", [".mp4", ".webm"]).optional().default("output.mp4"),
  poster: siblingFile("Poster", [".png", ".jpg", ".jpeg", ".webp", ".avif"]).optional(),
  captions: siblingFile("Captions", [".vtt"]).optional().default("subtitles.vtt"),
  captionLabel: boundedText("Caption label", 40).optional().default("English captions"),
  language: z
    .string()
    .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, "Language must be a BCP 47 tag")
    .optional()
    .default("en"),
  disclaimer: boundedText("Disclaimer", 300).optional(),
  noindex: z.boolean().optional().default(true),
  publicSafe: z.boolean().optional().default(true),
  embedMode: z.enum(["deny", "same-origin"]).optional().default("deny"),
});

export type ShareCta = z.infer<typeof shareCtaSchema>;
export type ShareViewerConfig = z.infer<typeof shareViewerConfigSchema>;
