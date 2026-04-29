import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resolveOutputDirFromLatest } from "./output-latest.js";

type PromptResult = {
  messages: Array<{ role: "user"; content: { type: "text"; text: string } }>;
};

const ANALYZER_REVIEW_PROMPT = "review-prompt.md";
const DEMO_REVIEW_FOCUS = [
  "Timing: flag steps under 100ms with no visible effect, dead air over 3s, and waits over 10s.",
  "Narration: verify narration leads into the action, matches the UI state, and avoids overlong lines.",
  "Visual clarity and layout safety: inspect cursor movement, zoom focus, readable target state, overlap, and phantom overlays.",
  "Selector/action correctness: verify each action lands on the intended UI target and produces the expected state.",
  "Flow: check chapter pacing, transitions, setup context, and missing assertions after key actions.",
  "Accessibility of the final video: confirm subtitles, audio, and on-screen text remain readable.",
  "Spec fidelity: compare the claimed demo journey with what the rendered video actually proves.",
];

function msg(text: string): PromptResult {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

async function readFileOrFallback(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return `(could not read file: ${filePath})`;
  }
}

async function readOptionalFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function demoAnalyzeCommand(outputDir: string, specPath: string | undefined): string {
  return ["demo-machine analyze", outputDir, specPath ? `--spec ${resolve(specPath)}` : ""]
    .filter(Boolean)
    .join(" ");
}

function buildDemoReviewFocusBlock(): string {
  return ["Demo-specific focus items:", ...DEMO_REVIEW_FOCUS.map((item) => `- ${item}`)].join("\n");
}

function buildAnalyzerPrompt(params: {
  resolvedOutputDir: string;
  analyzerPromptPath: string;
  analyzerPrompt: string;
  specPath: string | undefined;
  specContent: string;
}): string {
  return [
    "Review this demo-machine output using the video-evaluator package review prompt.",
    `Output dir: ${params.resolvedOutputDir}`,
    `Analyzer prompt: ${params.analyzerPromptPath}`,
    params.specPath ? `Spec file: ${resolve(params.specPath)}` : "",
    "",
    "Video-evaluator package review prompt:",
    "```markdown",
    params.analyzerPrompt.substring(0, 20000),
    "```",
    "",
    buildDemoReviewFocusBlock(),
    "",
    specBlock(params.specContent),
    "Structure the review with: Summary, Critical Issues, Warnings, Suggestions, and Pass/Warn/Fail judgment.",
  ]
    .filter(Boolean)
    .join("\n");
}

function specBlock(specContent: string): string {
  if (!specContent) return "";
  return [
    "Original spec (first 10000 chars):",
    "```yaml",
    specContent.substring(0, 10000),
    "```",
    "",
  ].join("\n");
}

async function buildFallbackPrompt(params: {
  resolvedOutputDir: string;
  analyzerPromptPath: string;
  specPath: string | undefined;
  specContent: string;
}): Promise<string> {
  const eventsContent = await readFileOrFallback(join(params.resolvedOutputDir, "events.json"));
  const metadataContent = await readFileOrFallback(join(params.resolvedOutputDir, "metadata.json"));
  const subtitlesContent = await readFileOrFallback(
    join(params.resolvedOutputDir, "subtitles.vtt"),
  );
  const verificationContent = await readFileOrFallback(
    join(params.resolvedOutputDir, "verification.json"),
  );

  return [
    "Review this demo-machine output for quality issues.",
    `Output dir: ${params.resolvedOutputDir}`,
    params.specPath ? `Spec file: ${resolve(params.specPath)}` : "",
    "",
    `Analyzer artifacts are missing: ${params.analyzerPromptPath}`,
    `For evidence-backed review, run \`${demoAnalyzeCommand(params.resolvedOutputDir, params.specPath)}\` first, then call MCP prompt \`review-demo\` again.`,
    "If analyze cannot run in this environment, continue with this limited raw-artifact review and call out missing evidence explicitly.",
    "",
    specBlock(params.specContent),
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
    `Video file: ${join(params.resolvedOutputDir, "output.mp4")} (run ffprobe to check resolution, duration, frame rate)`,
    "",
    buildDemoReviewFocusBlock(),
    "",
    "Structure the review with: Summary, Critical Issues, Warnings, Suggestions.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function reviewDemoHandler({
  outputDir,
  specPath,
}: {
  outputDir: string | undefined;
  specPath: string | undefined;
}): Promise<PromptResult> {
  const resolvedOutputDir = await resolveOutputDirFromLatest(outputDir);
  const analyzerPromptPath = join(resolvedOutputDir, ANALYZER_REVIEW_PROMPT);
  const analyzerPrompt = await readOptionalFile(analyzerPromptPath);
  const specContent = specPath ? await readFileOrFallback(resolve(specPath)) : "";

  if (analyzerPrompt) {
    return msg(
      buildAnalyzerPrompt({
        resolvedOutputDir,
        analyzerPromptPath,
        analyzerPrompt,
        specPath,
        specContent,
      }),
    );
  }

  return msg(
    await buildFallbackPrompt({
      resolvedOutputDir,
      analyzerPromptPath,
      specPath,
      specContent,
    }),
  );
}
