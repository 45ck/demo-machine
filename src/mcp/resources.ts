import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const TEXT_MARKDOWN = "text/markdown";
const TEXT_YAML = "application/yaml"; // RFC 9512 IANA-registered MIME type for YAML

const BASIC_TEMPLATE = `meta:
  title: "My App Demo"
  resolution:
    width: 1920
    height: 1080

runner:
  command: "npm run dev"
  url: "http://localhost:3000"
  timeout: 10000

chapters:
  - title: "Getting Started"
    steps:
      - action: navigate
        url: "http://localhost:3000"
        narration: "Welcome to the app."
      - action: click
        selector: "#get-started"
        narration: "Click Get Started to begin."
      - action: wait
        timeout: 1000
`;

const ACTIONS_DOCS = `# Available Actions

| Action           | Required Fields    | Description                              |
|------------------|--------------------|------------------------------------------|
| navigate         | url                | Go to a URL                              |
| click            | selector or target | Click an element                         |
| clickFirstVisible| selector           | Click first visible match                |
| type             | selector or target, text | Type text character-by-character   |
| hover            | selector or target | Hover over an element                    |
| scroll           | -                  | Scroll (selector or target, x, y optional)|
| wait             | timeout            | Pause for milliseconds                   |
| press            | key                | Press a keyboard key                     |
| screenshot       | -                  | Take a screenshot                        |
| assert           | selector or target | Assert element visibility or text        |
| check            | selector or target | Check a checkbox                         |
| uncheck          | selector or target | Uncheck a checkbox                       |
| select           | selector or target, option | Select a dropdown option         |
| selectFirstNonPlaceholder | selector or target | Select first non-placeholder option |
| upload           | selector or target, file | Upload a file                         |
| back             | -                  | Browser back                             |
| forward          | -                  | Browser forward                          |
| dragAndDrop      | from, to           | Drag and drop between elements           |

Every action supports an optional \`narration\` field for voice-over text.
Every action supports an optional \`delay\` field to override post-action delay (ms).
`;

const SPEC_FORMAT_DOCS = `# Demo Spec Format

Demo specs can be written in YAML, JSON, JSON5, or TOML.
Recommended extension: .demo.yaml

## Top-level fields

- **meta** (required): title, resolution (width/height), optional branding
- **runner** (optional): command to start your app, url to wait for, timeout
- **pacing** (optional): cursor/type/click delays in ms
- **narration** (optional): provider, voice, sync mode
- **preSteps** (optional): login/setup steps run before capture
- **chapters** (required): array of chapters with title and steps
- **redaction** (optional): selectors and secret patterns to blur

## Narration sync modes

- **manual**: narration is mixed after capture (default)
- **auto-sync**: narration is pre-synthesized and pacing adapts
- **warn-only**: logs timing warnings but uses manual mode

## Example

\`\`\`yaml
meta:
  title: "Product Demo"
  resolution:
    width: 1920
    height: 1080
  branding:
    logo: "./logo.png"
    colors:
      primary: "#4F46E5"
      background: "#0F172A"

runner:
  command: "npm run dev"
  url: "http://localhost:3000"
  timeout: 15000

pacing:
  cursorDurationMs: 600
  typeDelayMs: 50

chapters:
  - title: "Introduction"
    steps:
      - action: navigate
        url: "http://localhost:3000"
        narration: "Welcome to our product."
\`\`\`
`;

const AI_PROMPTS_DOCS = `# AI Prompts

Demo-machine provides MCP prompts that let AI assistants help with spec authoring, debugging, and review.

## Available Prompts

| Prompt | Description | Required Args | Optional Args |
|--------|-------------|---------------|---------------|
| \`create-demo-spec\` | Generate a demo spec YAML for a given application | \`appUrl\` | \`appDescription\` |
| \`debug-demo\` | Diagnose and fix a failing demo spec | \`specPath\` | \`errorMessage\` |
| \`narrate-spec\` | Generate narration text for every step in a spec | \`specPath\` | \`tone\` (formal/casual/technical) |
| \`heal-spec\` | Auto-fix a broken spec using failure artifacts | \`specPath\` | \`outputDir\` |
| \`demo-from-url\` | Generate a spec by crawling a live web app | \`appUrl\` | \`description\` |
| \`translate-spec\` | Translate all narration to another language | \`specPath\`, \`language\` | |
| \`spec-from-test\` | Convert a Playwright/Cypress test into a spec | \`testPath\` | |
| \`review-demo\` | AI quality review of a completed demo run | | \`outputDir\`, \`specPath\` |

## Typical Workflows

1. **New demo**: \`demo-from-url\` → \`narrate-spec\` → \`review-demo\`
2. **From tests**: \`spec-from-test\` → \`narrate-spec\` → \`review-demo\`
3. **Fix broken demo**: \`heal-spec\` or \`debug-demo\` → \`review-demo\`
4. **Localize**: \`translate-spec\` for each target language
`;

export function registerResources(server: McpServer): void {
  server.resource(
    "basic-template",
    "demo-machine://templates/basic",
    { mimeType: TEXT_YAML, description: "A basic demo spec template" },
    () =>
      Promise.resolve({
        contents: [
          {
            uri: "demo-machine://templates/basic",
            mimeType: TEXT_YAML,
            text: BASIC_TEMPLATE,
          },
        ],
      }),
  );

  server.resource(
    "actions-docs",
    "demo-machine://docs/actions",
    { mimeType: TEXT_MARKDOWN, description: "Documentation for available step actions" },
    () =>
      Promise.resolve({
        contents: [
          {
            uri: "demo-machine://docs/actions",
            mimeType: TEXT_MARKDOWN,
            text: ACTIONS_DOCS,
          },
        ],
      }),
  );

  server.resource(
    "spec-format-docs",
    "demo-machine://docs/spec-format",
    { mimeType: TEXT_MARKDOWN, description: "Documentation for the demo spec format" },
    () =>
      Promise.resolve({
        contents: [
          {
            uri: "demo-machine://docs/spec-format",
            mimeType: TEXT_MARKDOWN,
            text: SPEC_FORMAT_DOCS,
          },
        ],
      }),
  );

  server.resource(
    "ai-prompts-docs",
    "demo-machine://docs/ai-prompts",
    { mimeType: TEXT_MARKDOWN, description: "Documentation for AI-powered MCP prompts" },
    () =>
      Promise.resolve({
        contents: [
          {
            uri: "demo-machine://docs/ai-prompts",
            mimeType: TEXT_MARKDOWN,
            text: AI_PROMPTS_DOCS,
          },
        ],
      }),
  );
}
