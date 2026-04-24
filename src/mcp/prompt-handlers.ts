import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { resolveOutputDirFromLatest } from "./output-latest.js";
type PromptResult = {
  messages: Array<{ role: "user"; content: { type: "text"; text: string } }>;
};

export async function readFileOrFallback(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return `(could not read file: ${filePath})`;
  }
}

const SPEC_CONTENT_LABEL = "Spec content:";

export function msg(text: string): PromptResult {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

export async function debugDemoHandler({
  specPath,
  errorMessage,
}: {
  specPath: string;
  errorMessage: string | undefined;
}): Promise<PromptResult> {
  const resolvedPath = resolve(specPath);
  const specContent = await readFileOrFallback(resolvedPath);
  return msg(
    [
      "Debug this failing demo-machine spec:",
      `Spec file: ${resolvedPath}`,
      errorMessage ? `Error: ${errorMessage}` : "No error message provided.",
      "",
      SPEC_CONTENT_LABEL,
      "```yaml",
      specContent,
      "```",
      "",
      "Common issues to check:",
      "1. Selector not found - element may have changed or need a wait",
      "2. Timing issues - add wait steps after animations",
      "3. Navigation errors - check URL and runner config",
      "4. Missing runner command - app may not be started",
      "",
      "Diagnose the issue and suggest fixes.",
    ].join("\n"),
  );
}

export async function narrateSpecHandler({
  specPath,
  tone,
}: {
  specPath: string;
  tone: string | undefined;
}): Promise<PromptResult> {
  const resolvedPath = resolve(specPath);
  const specContent = await readFileOrFallback(resolvedPath);
  return msg(
    [
      "Generate compelling narration for this demo-machine spec:",
      `Spec file: ${resolvedPath}`,
      `Tone: ${tone ?? "formal"}`,
      "",
      SPEC_CONTENT_LABEL,
      "```yaml",
      specContent,
      "```",
      "",
      "Guidelines:",
      "1. Narration should lead into actions ('Let's click...' not 'We clicked...')",
      "2. Explain *why* each action is performed, not just describe it",
      "3. Flow as a coherent narrative across all chapters",
      "4. Keep narration to 5-15 words per step for TTS timing",
      "5. Skip trivial steps (wait, screenshot, intermediate clicks)",
      "6. First chapter should welcome/introduce; last should wrap up",
      "7. Not every step needs narration — aim for 60-80% coverage",
      "",
      "Output the full updated YAML spec with narration added to step and chapter narration fields.",
    ].join("\n"),
  );
}

export async function healSpecHandler({
  specPath,
  outputDir,
}: {
  specPath: string;
  outputDir: string | undefined;
}): Promise<PromptResult> {
  const resolvedSpecPath = resolve(specPath);
  const resolvedOutputDir = await resolveOutputDirFromLatest(outputDir);

  const specContent = await readFileOrFallback(resolvedSpecPath);
  const failureJson = await readFileOrFallback(join(resolvedOutputDir, "failure.json"));
  const failureHtml = await readFileOrFallback(join(resolvedOutputDir, "failure.html"));
  const eventsJson = await readFileOrFallback(join(resolvedOutputDir, "events.json"));

  return msg(
    [
      "Auto-fix this broken demo-machine spec by analyzing the failure artifacts:",
      `Spec file: ${resolvedSpecPath}`,
      `Output dir: ${resolvedOutputDir}`,
      "",
      SPEC_CONTENT_LABEL,
      "```yaml",
      specContent.substring(0, 10000),
      "```",
      "",
      "Failure details (failure.json) — first 10000 chars:",
      "```json",
      failureJson.substring(0, 10000),
      "```",
      "",
      "Page HTML at failure (failure.html) — first 5000 chars:",
      "```html",
      failureHtml.substring(0, 5000),
      "```",
      "",
      "Pre-failure event log (events.json) — first 10000 chars:",
      "```json",
      eventsJson.substring(0, 10000),
      "```",
      "",
      `Screenshot at failure: ${join(resolvedOutputDir, "failure.png")} (inspect visually for layout context)`,
      "",
      "Fix strategy:",
      "1. Identify the failed step and what went wrong",
      "2. Find the correct element in the current DOM",
      "3. Prefer resilient selectors: testId > role+name > label > text > CSS",
      "4. Update narration if the UI text changed",
      "5. Add wait steps if timing was the issue",
      "",
      "Output the fixed YAML spec. Explain each change you made.",
    ].join("\n"),
  );
}

export function demoFromUrlHandler({
  appUrl,
  description,
}: {
  appUrl: string;
  description: string | undefined;
}): Promise<PromptResult> {
  return Promise.resolve(
    msg(
      [
        "Generate a demo-machine YAML spec by crawling this live application:",
        `URL: ${appUrl}`,
        description ? `Journey to demo: ${description}` : "",
        "",
        "Steps:",
        "1. Navigate to the URL using Playwright to discover interactive elements",
        "2. Identify the primary user journey (buttons, forms, links, navigation)",
        "3. Generate a complete YAML spec with:",
        "   - Accessibility-first targets (role/label/testId, not CSS selectors)",
        "   - Narration text explaining *why* each action is performed",
        "   - Chapters organized by feature area",
        "   - Wait steps after animations and page transitions",
        "   - Assert steps to verify key state changes",
        "4. Use 1920x1080 resolution, reasonable pacing defaults",
        "",
        "Output the complete YAML spec.",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  );
}

export async function translateSpecHandler({
  specPath,
  language,
}: {
  specPath: string;
  language: string;
}): Promise<PromptResult> {
  const resolvedPath = resolve(specPath);
  const specContent = await readFileOrFallback(resolvedPath);
  return msg(
    [
      "Translate all narration in this demo-machine spec to another language:",
      `Spec file: ${resolvedPath}`,
      `Target language: ${language}`,
      "",
      SPEC_CONTENT_LABEL,
      "```yaml",
      specContent,
      "```",
      "",
      "Translation rules:",
      "1. Translate: step narration, chapter narration, meta.title",
      "2. Do NOT translate: selectors, URLs, action types, typed text, technical config",
      "3. Keep product names in English (they appear in the UI)",
      "4. Optimize for TTS: natural spoken phrasing, no abbreviations",
      "5. Keep translated text roughly the same length as original",
      "6. Use target language punctuation conventions",
      "",
      "Output the complete translated YAML spec.",
    ].join("\n"),
  );
}

export async function specFromTestHandler({
  testPath,
}: {
  testPath: string;
}): Promise<PromptResult> {
  const resolvedPath = resolve(testPath);
  const testContent = await readFileOrFallback(resolvedPath);
  return msg(
    [
      "Convert this E2E test file into a demo-machine YAML spec:",
      `Test file: ${resolvedPath}`,
      "",
      "Test content:",
      "```typescript",
      testContent,
      "```",
      "",
      "Conversion rules:",
      "1. Map describe/it/test blocks to chapters",
      "2. Convert Playwright/Cypress actions to demo-machine steps:",
      "   - page.goto → navigate, page.click → click, page.fill → type",
      "   - getByRole → target: {by: role}, getByTestId → target: {by: testId}",
      "   - getByLabel → target: {by: label}, getByText → target: {by: text}",
      "   - expect(...).toBeVisible → assert: {visible: true}",
      "   - expect(...).toContainText → assert: {text: ...}",
      "3. Infer runner config from test setup (base URL, beforeAll)",
      "4. Add wait steps after navigations and form submissions",
      "5. Leave narration empty — user should run narrate-spec afterward",
      "6. Use 1920x1080 resolution and reasonable pacing defaults",
      "",
      "Output the complete YAML spec.",
    ].join("\n"),
  );
}

export async function reviewDemoHandler({
  outputDir,
  specPath,
}: {
  outputDir: string | undefined;
  specPath: string | undefined;
}): Promise<PromptResult> {
  const resolvedOutputDir = await resolveOutputDirFromLatest(outputDir);

  const eventsContent = await readFileOrFallback(join(resolvedOutputDir, "events.json"));
  const metadataContent = await readFileOrFallback(join(resolvedOutputDir, "metadata.json"));
  const subtitlesContent = await readFileOrFallback(join(resolvedOutputDir, "subtitles.vtt"));
  const verificationContent = await readFileOrFallback(
    join(resolvedOutputDir, "verification.json"),
  );

  let specContent = "";
  if (specPath) {
    specContent = await readFileOrFallback(resolve(specPath));
  }

  return msg(
    [
      "Review this demo-machine output for quality issues:",
      `Output dir: ${resolvedOutputDir}`,
      specPath ? `Spec file: ${resolve(specPath)}` : "",
      "",
      specContent
        ? [
            "Original spec (first 10000 chars):",
            "```yaml",
            specContent.substring(0, 10000),
            "```",
            "",
          ].join("\n")
        : "",
      "Event log (events.json) — first 10000 chars:",
      "```json",
      eventsContent.substring(0, 10000),
      "```",
      "",
      "Capture metadata (first 5000 chars):",
      "```json",
      metadataContent.substring(0, 5000),
      "```",
      "",
      "Subtitles (subtitles.vtt) — first 10000 chars:",
      "```",
      subtitlesContent.substring(0, 10000),
      "```",
      "",
      "Artifact verification (first 5000 chars):",
      "```json",
      verificationContent.substring(0, 5000),
      "```",
      "",
      `Video file: ${join(resolvedOutputDir, "output.mp4")} (run ffprobe to check resolution, duration, frame rate)`,
      "",
      "Review checklist:",
      "1. Timing: flag steps <100ms (no visual effect) or >10s (too long)",
      "2. Gaps: dead air >3s with no narration",
      "3. Narration: missing on key actions, too long (>25 words), or too short (<3 words)",
      "4. Flow: chapters too long (>10 steps) or too short (1 step)",
      "5. Missing assertions after key actions (form submit, delete, toggle)",
      "6. Total duration: ideal 1-3 min, flag if >5 min or <30s",
      "",
      "Structure the review with: Summary, Critical Issues, Warnings, Suggestions.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}
