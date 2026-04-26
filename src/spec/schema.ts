import { z } from "zod";
import { narrationFocusSchema, preStepSchema, stepSchema } from "./step-schema.js";

const resolutionSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const cssColorPattern = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+(@[0-9.]+)?)$/;

const colorsSchema = z.object({
  primary: z.string().regex(cssColorPattern, "Invalid color format"),
  background: z.string().regex(cssColorPattern, "Invalid color format"),
});

const brandingSchema = z.object({
  logo: z.string().optional(),
  colors: colorsSchema.optional(),
});

const metaSchema = z.object({
  title: z.string().min(1),
  resolution: resolutionSchema.optional().default({ width: 1920, height: 1080 }),
  branding: brandingSchema.optional(),
  selectApproach: z.enum(["A", "B", "C", "D"]).optional(),
});

const runnerConfigSchema = z.object({
  command: z.string().optional(),
  url: z.string().url(),
  healthcheck: z.string().url().optional(),
  timeout: z.number().int().positive().optional().default(30000),
});

const redactionConfigSchema = z.object({
  selectors: z.array(z.string().min(1)).optional().default([]),
  secrets: z.array(z.string().min(1)).optional().default([]),
});

const pacingSchema = z.object({
  cursorDurationMs: z.number().nonnegative().optional().default(600),
  typeDelayMs: z.number().nonnegative().optional().default(50),
  postClickDelayMs: z.number().nonnegative().optional().default(500),
  postTypeDelayMs: z.number().nonnegative().optional().default(300),
  postNavigateDelayMs: z.number().nonnegative().optional().default(1000),
  settleDelayMs: z.number().nonnegative().optional().default(200),
});

const narrationSyncSchema = z.object({
  mode: z.enum(["auto-sync", "manual", "warn-only"]).optional().default("manual"),
  bufferMs: z.number().int().nonnegative().optional().default(500),
});

const narrationSchema = z.object({
  enabled: z.boolean().optional().default(true),
  provider: z.string().optional(),
  voice: z.string().optional(),
  sync: narrationSyncSchema.optional().default({ mode: "manual", bufferMs: 500 }),
});

const defaultNarrationFocus = {
  enabled: true,
  cursor: true,
  highlight: true,
  zoom: true,
  scale: 1.35,
  durationMs: 2600,
  transitionMs: 700,
};

const presentationSchema = z.object({
  narrationFocus: narrationFocusSchema.optional().default(defaultNarrationFocus),
});

const changeDetectionSchema = z.object({
  mode: z.enum(["error", "warn", "off"]).optional().default("error"),
  detectors: z
    .array(z.string().min(1))
    .optional()
    .default(["dom-mutation", "layout", "computed-style", "aria-state"]),
  mutationWaitMs: z.number().nonnegative().optional().default(100),
  screenshotThreshold: z.number().nonnegative().max(1).optional().default(0.001),
});

const chapterSchema = z.object({
  title: z.string().min(1),
  narration: z.string().optional(),
  steps: z.array(stepSchema).min(1),
});

export const demoSpecSchema = z.object({
  meta: metaSchema,
  runner: runnerConfigSchema.optional(),
  preSteps: z.array(preStepSchema).optional(),
  redaction: redactionConfigSchema.optional(),
  narration: narrationSchema.optional(),
  presentation: presentationSchema.optional().default({ narrationFocus: defaultNarrationFocus }),
  pacing: pacingSchema.optional().default({}),
  changeDetection: changeDetectionSchema.optional(),
  chapters: z.array(chapterSchema).min(1),
});
