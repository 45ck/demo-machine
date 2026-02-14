# demo-machine

**Demo as code** — turn YAML specs into polished product demo videos with smooth cursor animation, natural typing, and professional overlays.

Write a simple YAML file describing what to click, type, and navigate. demo-machine launches your app, drives a real browser with human-like interactions, records everything, and renders a production-ready MP4.

## Example Output

https://github.com/45ck/demo-machine/raw/master/examples/todo-app-demo.mp4

<details>
<summary>YAML spec that produced this video</summary>

```yaml
meta:
  title: "TaskFlow - Task Manager Demo"
  resolution:
    width: 1920
    height: 1080

runner:
  command: "node examples/todo-app/serve.mjs"
  url: "http://localhost:4567"
  timeout: 10000

chapters:
  - title: "Welcome to TaskFlow"
    steps:
      - action: navigate
        url: "http://localhost:4567"
      - action: wait
        timeout: 1000

  - title: "Getting Started"
    steps:
      - action: click
        selector: "#get-started"
      - action: wait
        timeout: 800

  - title: "Adding Tasks"
    steps:
      - action: click
        selector: "#task-input"
      - action: type
        selector: "#task-input"
        text: "Design new landing page"
      - action: click
        selector: "#add-btn"
      - action: wait
        timeout: 500
      - action: type
        selector: "#task-input"
        text: "Review pull requests"
      - action: click
        selector: "#add-btn"
      - action: wait
        timeout: 500
      - action: type
        selector: "#task-input"
        text: "Write unit tests"
      - action: click
        selector: "#add-btn"
      - action: wait
        timeout: 500

  - title: "Completing a Task"
    steps:
      - action: click
        selector: ".task-checkbox"
      - action: wait
        timeout: 800

  - title: "Filtering Tasks"
    steps:
      - action: click
        selector: "[data-filter='completed']"
      - action: wait
        timeout: 800
      - action: click
        selector: "[data-filter='all']"
      - action: wait
        timeout: 500
```

[View full YAML spec](examples/todo-app.demo.yaml)

</details>

## Features

- **YAML-driven** — declarative specs, version-controlled, reviewable in PRs
- **Smooth cursor animation** — eased movement with cubic bezier, click pulse feedback
- **Character-by-character typing** — natural typing speed, not instant `fill()`
- **Deliberate pacing** — configurable delays after clicks, typing, and navigation
- **Polished overlays** — intro/outro cards, chapter titles with semi-transparent backgrounds and fade transitions
- **Auto app lifecycle** — spawns your dev server, waits for healthcheck, tears down after capture
- **Redaction** — blur sensitive selectors, scan for secret patterns in page text
- **Narration ready** — TTS provider support (OpenAI, ElevenLabs, Piper) with VTT/SRT subtitles
- **Dead-time compression** — long pauses in recordings are automatically sped up
- **Callout zoom** — click targets get highlighted with zoom regions

## Quick Start

### Prerequisites

- **Node.js** >= 22
- **pnpm**
- **ffmpeg** on your PATH
- **Playwright** browsers: `pnpm exec playwright install chromium`

### Install

```bash
git clone https://github.com/45ck/demo-machine.git
cd demo-machine
pnpm install
pnpm build
```

### Run the Example

```bash
node dist/cli.js run examples/todo-app.demo.yaml --output ./output --no-narration --no-headless
```

This will:

1. Start the included todo-app server
2. Launch a browser and perform all steps with smooth cursor + typing
3. Record the session
4. Render a polished MP4 to `./output/output.mp4`

## Usage

### CLI Commands

```bash
# Full pipeline: capture + edit + render
demo-machine run <spec.yaml>

# Validate a spec file without running
demo-machine validate <spec.yaml>

# Capture only (raw video, no overlays)
demo-machine capture <spec.yaml>

# Re-edit from existing event log
demo-machine edit <events.json>
```

### Options

| Flag                    | Default    | Description                      |
| ----------------------- | ---------- | -------------------------------- |
| `-o, --output <dir>`    | `./output` | Output directory                 |
| `--no-narration`        | —          | Skip TTS narration               |
| `--no-edit`             | —          | Raw capture only, skip rendering |
| `--no-headless`         | —          | Show the browser window          |
| `--renderer <name>`     | `ffmpeg`   | Video renderer                   |
| `--tts-provider <name>` | `openai`   | TTS: openai, elevenlabs, piper   |
| `--verbose`             | —          | Debug logging                    |

## Spec Format

### Minimal Spec

```yaml
meta:
  title: "My Demo"

runner:
  url: "http://localhost:3000"

chapters:
  - title: "Getting Started"
    steps:
      - action: navigate
        url: "/"
      - action: click
        selector: "#btn"
```

### Action Types

| Action       | Required Fields    | Description                                     |
| ------------ | ------------------ | ----------------------------------------------- |
| `navigate`   | `url`              | Go to a URL                                     |
| `click`      | `selector`         | Click an element                                |
| `type`       | `selector`, `text` | Type text character-by-character                |
| `hover`      | `selector`         | Hover over an element                           |
| `scroll`     | —                  | Scroll the page (`selector`, `x`, `y` optional) |
| `wait`       | `timeout`          | Pause for milliseconds                          |
| `press`      | `key`              | Press a keyboard key                            |
| `assert`     | `selector`         | Assert visibility or text content               |
| `screenshot` | —                  | Take a screenshot (`name` optional)             |

Every action supports an optional `narration` field for TTS, and most support `delay` to override the default post-action pause.

### Pacing

Control the feel of the demo globally:

```yaml
pacing:
  cursorDurationMs: 600 # cursor travel time
  typeDelayMs: 50 # ms between keystrokes
  postClickDelayMs: 500 # pause after clicks
  postTypeDelayMs: 300 # pause after typing
  postNavigateDelayMs: 1000 # pause after navigation
  settleDelayMs: 200 # micro-pause after every action
```

All pacing fields are optional with sensible defaults.

### Redaction

Blur sensitive content and scan for secret patterns:

```yaml
redaction:
  selectors:
    - ".user-email"
    - "[data-sensitive]"
  secrets:
    - "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z]{2,}\\b"
```

### Branding

```yaml
meta:
  branding:
    logo: "./assets/logo.png"
    colors:
      primary: "#3B82F6"
      background: "#000000"
```

## Architecture

```
YAML Spec
    |
    v
[Spec Loader] ---> Zod validation + defaults
    |
    v
[Runner] ---> Spawn dev server, healthcheck, teardown
    |
    v
[Playback Engine] ---> Cursor animation, typing, pacing
    |                   Playwright browser automation
    v
[Capture] ---> Video recording + event log
    |
    v
[Timeline] ---> Intro/outro, chapters, callouts, dead-time compression
    |
    v
[FFmpeg Renderer] ---> Overlays, fades, final MP4
    |
    v
[Narration] ---> TTS + VTT/SRT subtitles (optional)
```

## Development

```bash
pnpm build          # Compile TypeScript
pnpm test           # Run all tests (171 tests)
pnpm lint           # ESLint
pnpm format         # Prettier check
pnpm typecheck      # tsc --noEmit
pnpm validate       # Run everything
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide.

## License

[MIT](LICENSE)
