import { z } from "zod";

const resolutionSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const colorsSchema = z.object({
  primary: z.string(),
  background: z.string(),
});

const brandingSchema = z.object({
  logo: z.string().optional(),
  colors: colorsSchema.optional(),
});

const metaSchema = z.object({
  title: z.string().min(1),
  resolution: resolutionSchema.optional().default({ width: 1920, height: 1080 }),
  branding: brandingSchema.optional(),
});

const runnerConfigSchema = z.object({
  command: z.string().optional(),
  url: z.string().url(),
  healthcheck: z.string().url().optional(),
  timeout: z.number().int().positive().optional().default(30000),
});

const redactionConfigSchema = z.object({
  selectors: z.array(z.string()).optional().default([]),
  secrets: z.array(z.string()).optional().default([]),
});

const pacingSchema = z.object({
  cursorDurationMs: z.number().optional().default(600),
  typeDelayMs: z.number().optional().default(50),
  postClickDelayMs: z.number().optional().default(500),
  postTypeDelayMs: z.number().optional().default(300),
  postNavigateDelayMs: z.number().optional().default(1000),
  settleDelayMs: z.number().optional().default(200),
});

const navigateStepSchema = z.object({
  action: z.literal("navigate"),
  url: z.string(),
  narration: z.string().optional(),
});

const clickStepSchema = z.object({
  action: z.literal("click"),
  selector: z.string(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
});

const typeStepSchema = z.object({
  action: z.literal("type"),
  selector: z.string(),
  text: z.string(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
});

const hoverStepSchema = z.object({
  action: z.literal("hover"),
  selector: z.string(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
});

const scrollStepSchema = z.object({
  action: z.literal("scroll"),
  selector: z.string().optional(),
  x: z.number().optional().default(0),
  y: z.number().optional().default(0),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
});

const waitStepSchema = z.object({
  action: z.literal("wait"),
  timeout: z.number().int().positive(),
  narration: z.string().optional(),
});

const assertStepSchema = z.object({
  action: z.literal("assert"),
  selector: z.string(),
  visible: z.boolean().optional(),
  text: z.string().optional(),
  narration: z.string().optional(),
});

const screenshotStepSchema = z.object({
  action: z.literal("screenshot"),
  name: z.string().optional(),
  narration: z.string().optional(),
});

const pressStepSchema = z.object({
  action: z.literal("press"),
  key: z.string(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
});

const stepSchema = z.discriminatedUnion("action", [
  navigateStepSchema,
  clickStepSchema,
  typeStepSchema,
  hoverStepSchema,
  scrollStepSchema,
  waitStepSchema,
  assertStepSchema,
  screenshotStepSchema,
  pressStepSchema,
]);

const chapterSchema = z.object({
  title: z.string().min(1),
  narration: z.string().optional(),
  steps: z.array(stepSchema).min(1),
});

export const demoSpecSchema = z.object({
  meta: metaSchema,
  runner: runnerConfigSchema.optional(),
  redaction: redactionConfigSchema.optional(),
  pacing: pacingSchema.optional().default({}),
  chapters: z.array(chapterSchema).min(1),
});
