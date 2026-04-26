/* eslint-disable max-lines */
import { z } from "zod";

const nonBlankString = z
  .string()
  .min(1)
  .refine((s) => s.trim().length > 0, "Value cannot be whitespace-only");

const targetSchema = z.discriminatedUnion("by", [
  z.object({ by: z.literal("css"), selector: nonBlankString }),
  z.object({ by: z.literal("text"), text: nonBlankString, exact: z.boolean().optional() }),
  z.object({
    by: z.literal("role"),
    role: nonBlankString,
    name: nonBlankString.optional(),
    exact: z.boolean().optional(),
  }),
  z.object({ by: z.literal("testId"), testId: nonBlankString }),
  z.object({ by: z.literal("label"), text: nonBlankString, exact: z.boolean().optional() }),
  z.object({
    by: z.literal("placeholder"),
    text: nonBlankString,
    exact: z.boolean().optional(),
  }),
  z.object({ by: z.literal("altText"), text: nonBlankString, exact: z.boolean().optional() }),
  z.object({ by: z.literal("title"), text: nonBlankString, exact: z.boolean().optional() }),
]);

const valueFromSchema = z.object({
  source: z.string().min(1),
  path: nonBlankString.optional(),
});

export const narrationFocusSchema = z.object({
  enabled: z.boolean().optional().default(true),
  cursor: z.boolean().optional().default(true),
  highlight: z.boolean().optional().default(true),
  zoom: z.boolean().optional().default(true),
  selector: nonBlankString.optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  scale: z.number().min(1).max(2.2).optional().default(1.35),
  durationMs: z.number().int().min(0).max(15000).optional().default(2600),
  transitionMs: z.number().int().min(0).max(3000).optional().default(700),
});

const stepFocusSchema = narrationFocusSchema;

const preHttpRequestStepSchema = z.object({
  action: z.literal("httpRequest"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional().default("GET"),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  expectStatus: z
    .union([z.number().int().min(100).max(599), z.array(z.number().int().min(100).max(599)).min(1)])
    .optional(),
  saveResponseAs: z.string().min(1).optional(),
});

const preSetCookieStepSchema = z
  .object({
    action: z.literal("setCookie"),
    name: z.string().min(1),
    value: z.string().optional(),
    valueFrom: valueFromSchema.optional(),
    url: z.string().min(1).optional(),
    domain: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    secure: z.boolean().optional(),
    httpOnly: z.boolean().optional(),
    sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
    expires: z.number().nonnegative().optional(),
  })
  .refine((v) => v.value !== undefined || v.valueFrom !== undefined, {
    message: "setCookie requires value or valueFrom",
  });

const preSetLocalStorageStepSchema = z
  .object({
    action: z.literal("setLocalStorage"),
    key: z.string().min(1),
    value: z.string().optional(),
    valueFrom: valueFromSchema.optional(),
    origin: z.string().min(1).optional(),
  })
  .refine((v) => v.value !== undefined || v.valueFrom !== undefined, {
    message: "setLocalStorage requires value or valueFrom",
  });

export const preStepSchema = z.union([
  preHttpRequestStepSchema,
  preSetCookieStepSchema,
  preSetLocalStorageStepSchema,
]);

const navigateStepSchema = z.object({
  action: z.literal("navigate"),
  url: nonBlankString,
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
  timeoutMs: z.number().int().positive().optional(),
  narration: z.string().optional(),
  focus: stepFocusSchema.optional(),
});

const clickStepSchema = z.object({
  action: z.literal("click"),
  selector: nonBlankString.optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
  expectVisualChange: z.boolean().optional(),
  focus: stepFocusSchema.optional(),
});

const clickFirstVisibleStepSchema = z.object({
  action: z.literal("clickFirstVisible"),
  selector: nonBlankString,
  nth: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
  expectVisualChange: z.boolean().optional(),
  focus: stepFocusSchema.optional(),
});

const typeStepSchema = z.object({
  action: z.literal("type"),
  selector: nonBlankString.optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  text: nonBlankString,
  clear: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
  expectVisualChange: z.boolean().optional(),
  focus: stepFocusSchema.optional(),
});

const hoverStepSchema = z.object({
  action: z.literal("hover"),
  selector: nonBlankString.optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
  expectVisualChange: z.boolean().optional(),
  focus: stepFocusSchema.optional(),
});

const scrollStepSchema = z.object({
  action: z.literal("scroll"),
  selector: nonBlankString.optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  x: z.number().finite().optional().default(0),
  // Default to a meaningful downward scroll so specs can omit y for common cases.
  y: z.number().finite().optional().default(800),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
  expectVisualChange: z.boolean().optional(),
  focus: stepFocusSchema.optional(),
});

const waitStepSchema = z.object({
  action: z.literal("wait"),
  timeout: z.number().int().positive(),
  narration: z.string().optional(),
  focus: stepFocusSchema.optional(),
});

const assertStepSchema = z.object({
  action: z.literal("assert"),
  selector: nonBlankString.optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  visible: z.boolean().optional(),
  text: z.string().optional(),
  count: z.number().int().nonnegative().optional(),
  value: z.string().optional(),
  checked: z.boolean().optional(),
  enabled: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
  narration: z.string().optional(),
  focus: stepFocusSchema.optional(),
});

const checkStepSchema = z.object({
  action: z.literal("check"),
  selector: nonBlankString.optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
  expectVisualChange: z.boolean().optional(),
  focus: stepFocusSchema.optional(),
});

const uncheckStepSchema = z.object({
  action: z.literal("uncheck"),
  selector: nonBlankString.optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
  expectVisualChange: z.boolean().optional(),
  focus: stepFocusSchema.optional(),
});

const selectOptionSchema = z.union([
  z.object({ value: z.string().min(1) }),
  z.object({ label: z.string().min(1) }),
  z.object({ index: z.number().int().nonnegative() }),
]);

const selectStepSchema = z.object({
  action: z.literal("select"),
  selector: nonBlankString.optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  option: selectOptionSchema,
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
  expectVisualChange: z.boolean().optional(),
  focus: stepFocusSchema.optional(),
});

const selectFirstNonPlaceholderStepSchema = z.object({
  action: z.literal("selectFirstNonPlaceholder"),
  selector: nonBlankString.optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
  expectVisualChange: z.boolean().optional(),
  focus: stepFocusSchema.optional(),
});

const uploadStepSchema = z.object({
  action: z.literal("upload"),
  selector: nonBlankString.optional(),
  target: targetSchema.optional(),
  nth: z.number().int().nonnegative().optional(),
  file: z.string().min(1).optional(),
  files: z.array(z.string().min(1)).min(1).optional(),
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
  expectVisualChange: z.boolean().optional(),
  focus: stepFocusSchema.optional(),
});

const dragEndpointSchema = z.object({
  selector: nonBlankString.optional(),
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
  expectVisualChange: z.boolean().optional(),
  focus: stepFocusSchema.optional(),
});

const screenshotStepSchema = z.object({
  action: z.literal("screenshot"),
  name: nonBlankString.optional(),
  narration: z.string().optional(),
  focus: stepFocusSchema.optional(),
});

const pressStepSchema = z.object({
  action: z.literal("press"),
  key: nonBlankString,
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
  focus: stepFocusSchema.optional(),
});

const navTimingFields = {
  timeoutMs: z.number().int().positive().optional(),
  delay: z.number().int().positive().optional(),
  narration: z.string().optional(),
  focus: stepFocusSchema.optional(),
};
const backStepSchema = z.object({ action: z.literal("back"), ...navTimingFields });
const forwardStepSchema = z.object({ action: z.literal("forward"), ...navTimingFields });

const needsSelector = (v: { selector?: string | undefined; target?: unknown }) =>
  Boolean(v.selector || v.target);
const selectorMsg = (name: string) => ({ message: `${name} requires selector or target` });

const clickStepSchemaValidated = clickStepSchema.refine(needsSelector, selectorMsg("click"));
const typeStepSchemaValidated = typeStepSchema.refine(needsSelector, selectorMsg("type"));
const hoverStepSchemaValidated = hoverStepSchema.refine(needsSelector, selectorMsg("hover"));
const assertStepSchemaValidated = assertStepSchema
  .refine(needsSelector, selectorMsg("assert"))
  .refine((v) => v.count === undefined || Boolean(v.selector), {
    message: 'assert count requires a CSS "selector"; structured "target" cannot be counted',
  })
  .refine(
    (v) =>
      v.visible !== undefined ||
      (v.text !== undefined && v.text !== null) ||
      v.count !== undefined ||
      v.value !== undefined ||
      v.checked !== undefined ||
      v.enabled !== undefined,
    {
      message:
        'assert step must specify at least one of: "visible", "text", "count", "value", "checked", "enabled"',
    },
  );
const checkStepSchemaValidated = checkStepSchema.refine(needsSelector, selectorMsg("check"));
const uncheckStepSchemaValidated = uncheckStepSchema.refine(needsSelector, selectorMsg("uncheck"));
const selectStepSchemaValidated = selectStepSchema.refine(needsSelector, selectorMsg("select"));
const selectFirstNonPlaceholderStepSchemaValidated = selectFirstNonPlaceholderStepSchema.refine(
  needsSelector,
  selectorMsg("selectFirstNonPlaceholder"),
);
const uploadStepSchemaValidated = uploadStepSchema
  .refine((v) => v.selector || v.target, { message: "upload requires selector or target" })
  .refine((v) => v.file || v.files, { message: "upload requires file or files" })
  .refine((v) => !(v.file && v.files), {
    message: 'upload: provide either "file" or "files", not both',
  });
const dragAndDropStepSchemaValidated = dragAndDropStepSchema
  .refine((v) => v.from.selector || v.from.target, {
    message: "dragAndDrop.from requires selector or target",
  })
  .refine((v) => v.to.selector || v.to.target, {
    message: "dragAndDrop.to requires selector or target",
  });

export const stepSchema = z.union([
  navigateStepSchema,
  clickStepSchemaValidated,
  clickFirstVisibleStepSchema,
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
  selectFirstNonPlaceholderStepSchemaValidated,
  uploadStepSchemaValidated,
  dragAndDropStepSchemaValidated,
]);
