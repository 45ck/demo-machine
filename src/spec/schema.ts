import { z } from "zod";

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

const targetSchema = z.discriminatedUnion("by", [
  z.object({ by: z.literal("css"), selector: z.string().min(1) }),
  z.object({ by: z.literal("text"), text: z.string().min(1), exact: z.boolean().optional() }),
  z.object({
    by: z.literal("role"),
    role: z.string().min(1),
    name: z.string().optional(),
    exact: z.boolean().optional(),
  }),
  z.object({ by: z.literal("testId"), testId: z.string().min(1) }),
  z.object({ by: z.literal("label"), text: z.string().min(1), exact: z.boolean().optional() }),
  z.object({
    by: z.literal("placeholder"),
    text: z.string().min(1),
    exact: z.boolean().optional(),
  }),
  z.object({ by: z.literal("altText"), text: z.string().min(1), exact: z.boolean().optional() }),
  z.object({ by: z.literal("title"), text: z.string().min(1), exact: z.boolean().optional() }),
]);

const navigateStepSchema = z.object({
  action: z.literal("navigate"),
  url: z.string(),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
  timeoutMs: z.number().int().positive().optional(),
  narration: z.string().optional(),
});

const clickStepSchema = z.object({
  action: z.literal("click"),
  selector: z.string().optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
});

const typeStepSchema = z.object({
  action: z.literal("type"),
  selector: z.string().optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  text: z.string(),
  clear: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
});

const hoverStepSchema = z.object({
  action: z.literal("hover"),
  selector: z.string().optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
});

const scrollStepSchema = z.object({
  action: z.literal("scroll"),
  selector: z.string().optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  x: z.number().optional().default(0),
  // Default to a meaningful downward scroll so specs can omit y for common cases
  // like "scroll a list to load more".
  y: z.number().optional().default(800),
  timeoutMs: z.number().int().positive().optional(),
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
  selector: z.string().optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  visible: z.boolean().optional(),
  text: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  narration: z.string().optional(),
});

const checkStepSchema = z.object({
  action: z.literal("check"),
  selector: z.string().optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
});

const uncheckStepSchema = z.object({
  action: z.literal("uncheck"),
  selector: z.string().optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
});

const selectOptionSchema = z.union([
  z.object({ value: z.string().min(1) }),
  z.object({ label: z.string().min(1) }),
  z.object({ index: z.number().int().nonnegative() }),
]);

const selectStepSchema = z.object({
  action: z.literal("select"),
  selector: z.string().optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  option: selectOptionSchema,
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
});

const uploadStepSchema = z.object({
  action: z.literal("upload"),
  selector: z.string().optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  file: z.string().min(1).optional(),
  files: z.array(z.string().min(1)).min(1).optional(),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
});

const dragEndpointSchema = z.object({
  selector: z.string().optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
});

const dragAndDropStepSchema = z.object({
  action: z.literal("dragAndDrop"),
  from: dragEndpointSchema,
  to: dragEndpointSchema,
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
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

const backStepSchema = z.object({
  action: z.literal("back"),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
});

const forwardStepSchema = z.object({
  action: z.literal("forward"),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
});

const clickStepSchemaValidated = clickStepSchema.refine((v) => v.selector || v.target, {
  message: "click requires selector or target",
});
const typeStepSchemaValidated = typeStepSchema.refine((v) => v.selector || v.target, {
  message: "type requires selector or target",
});
const hoverStepSchemaValidated = hoverStepSchema.refine((v) => v.selector || v.target, {
  message: "hover requires selector or target",
});
const assertStepSchemaValidated = assertStepSchema.refine((v) => v.selector || v.target, {
  message: "assert requires selector or target",
});
const checkStepSchemaValidated = checkStepSchema.refine((v) => v.selector || v.target, {
  message: "check requires selector or target",
});
const uncheckStepSchemaValidated = uncheckStepSchema.refine((v) => v.selector || v.target, {
  message: "uncheck requires selector or target",
});
const selectStepSchemaValidated = selectStepSchema.refine((v) => v.selector || v.target, {
  message: "select requires selector or target",
});
const uploadStepSchemaValidated = uploadStepSchema
  .refine((v) => v.selector || v.target, { message: "upload requires selector or target" })
  .refine((v) => v.file || v.files, { message: "upload requires file or files" });
const dragAndDropStepSchemaValidated = dragAndDropStepSchema
  .refine((v) => v.from.selector || v.from.target, {
    message: "dragAndDrop.from requires selector or target",
  })
  .refine((v) => v.to.selector || v.to.target, {
    message: "dragAndDrop.to requires selector or target",
  });

const stepSchema = z.union([
  navigateStepSchema,
  clickStepSchemaValidated,
  typeStepSchemaValidated,
  hoverStepSchemaValidated,
  scrollStepSchema,
  waitStepSchema,
  assertStepSchemaValidated,
  screenshotStepSchema,
  pressStepSchema,
  backStepSchema,
  forwardStepSchema,
  checkStepSchemaValidated,
  uncheckStepSchemaValidated,
  selectStepSchemaValidated,
  uploadStepSchemaValidated,
  dragAndDropStepSchemaValidated,
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
  narration: narrationSchema.optional(),
  pacing: pacingSchema.optional().default({}),
  chapters: z.array(chapterSchema).min(1),
});
