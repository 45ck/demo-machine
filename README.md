<div align="center">

# demo-machine

**Demo as code** — turn YAML specs into polished product demo videos.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/Tests-172%20passing-brightgreen)](tests/)
[![Playwright](https://img.shields.io/badge/Playwright-Browser%20Automation-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Video%20Rendering-007808?logo=ffmpeg&logoColor=white)](https://ffmpeg.org)

Write a simple YAML file describing what to click, type, and navigate.<br>
demo-machine launches your app, drives a real browser with human-like interactions,<br>
records everything, and renders a production-ready MP4.

[Quick Start](#quick-start) &bull; [Spec Format](#spec-format) &bull; [CLI Reference](#usage) &bull; [Contributing](CONTRIBUTING.md)

</div>

---

## Demo

> A task manager app demo with voice narration — generated entirely from a [YAML spec](examples/todo-app.demo.yaml).

https://github.com/45ck/demo-machine/raw/master/examples/todo-app-demo.mp4

Notice the **smooth cursor movement** to each target, **character-by-character typing**, **voice narration** that leads into each action, and **polished overlays** with fades. This is not a screen recording — it's generated from code.

<details>
<summary><b>View the YAML spec that produced this video</b></summary>

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
        narration: "Welcome to TaskFlow, a simple and elegant task manager."
      - action: wait
        timeout: 1000

  - title: "Getting Started"
    steps:
      - action: click
        selector: "#get-started"
        narration: "Let's click Get Started to begin managing our tasks."
      - action: wait
        timeout: 800

  - title: "Adding Tasks"
    steps:
      - action: click
        selector: "#task-input"
      - action: type
        selector: "#task-input"
        text: "Design new landing page"
        narration: "We'll type in our first task — designing a new landing page."
      - action: click
        selector: "#add-btn"
      - action: wait
        timeout: 500
      - action: type
        selector: "#task-input"
        text: "Review pull requests"
        narration: "Next, let's add a task to review pull requests."
      - action: click
        selector: "#add-btn"
      - action: wait
        timeout: 500
      - action: type
        selector: "#task-input"
        text: "Write unit tests"
        narration: "And one more — writing unit tests."
      - action: click
        selector: "#add-btn"
      - action: wait
        timeout: 500

  - title: "Completing a Task"
    steps:
      - action: click
        selector: ".task-checkbox"
        narration: "To mark a task as done, just click the checkbox."
      - action: wait
        timeout: 800

  - title: "Filtering Tasks"
    steps:
      - action: click
        selector: "[data-filter='completed']"
        narration: "We can filter to see only completed tasks."
      - action: wait
        timeout: 800
      - action: click
        selector: "[data-filter='all']"
        narration: "Or switch back to view all tasks at once."
      - action: wait
        timeout: 500
```

</details>

## Why demo-machine?

Tools like Screen Studio and Arcade require manual recording sessions. Every time your UI changes, you re-record. demo-machine takes a different approach:

- **Reproducible** — same YAML, same video, every time
- **Version-controlled** — specs live in your repo, reviewable in PRs
- **CI-friendly** — generate demo videos in your pipeline on every release
- **No manual work** — no clicking through your app, no editing in a video tool

## Features

| Feature                   | Description                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| **Smooth cursor**         | Cubic-bezier eased movement with click pulse feedback                       |
| **Natural typing**        | Character-by-character keystroke simulation                                 |
| **Configurable pacing**   | Global + per-step delays for clicks, typing, navigation                     |
| **Polished overlays**     | Intro/outro cards, chapter titles with fades and backgrounds                |
| **Auto app lifecycle**    | Spawns your dev server, healthchecks, tears down after                      |
| **Redaction**             | Blur sensitive selectors, scan for secret patterns                          |
| **Narration**             | Local TTS via Kokoro, or cloud via OpenAI/ElevenLabs with VTT/SRT subtitles |
| **Dead-time compression** | Long pauses automatically sped up                                           |
| **Callout zoom**          | Click targets highlighted with zoom regions                                 |

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) >= 22
- [pnpm](https://pnpm.io)
- [FFmpeg](https://ffmpeg.org) on your PATH
- Playwright browsers: `pnpm exec playwright install chromium`

### Install

```bash
git clone https://github.com/45ck/demo-machine.git
cd demo-machine
pnpm install
pnpm build
```

### Run the Example

```bash
node dist/cli.js run examples/todo-app.demo.yaml \
  --output ./output \
  --no-headless
```

This will:

1. Start the included todo-app dev server
2. Launch a browser with smooth cursor and natural typing
3. Record the session via Playwright
4. Render a polished MP4 with overlays to `./output/output.mp4`

## Usage

### CLI Commands

```bash
# Full pipeline: capture + edit + render
demo-machine run <spec.yaml>

# Validate a spec file without running
demo-machine validate <spec.yaml>

# Capture only (raw video, no post-processing)
demo-machine capture <spec.yaml>

# Re-render from an existing event log
demo-machine edit <events.json>
```

### Example Suite

The repo includes multiple example apps and `.demo.yaml` specs under `examples/`.

```bash
# Validate all example specs
pnpm examples:validate

# Smoke-capture raw videos for all example specs (no narration, no post-processing)
pnpm examples:capture

# Filter to a subset (note the `--` for pnpm passthrough)
pnpm examples:capture -- --filter spa-router
```

`capture` and `run` write these artifacts into `--output`:

- `video.webm` (raw recording)
- `events.json` (event log)
- `metadata.json` (capture timing info used for accurate timelines)
- `trace.zip` (Playwright trace)

`edit` expects `video.webm` to be in the same directory as the `events.json` you pass. If `metadata.json` exists, it will be used automatically.

### Options

| Flag                    | Default    | Description                                    |
| ----------------------- | ---------- | ---------------------------------------------- |
| `-o, --output <dir>`    | `./output` | Output directory                               |
| `--no-narration`        | —          | Skip TTS narration                             |
| `--no-edit`             | —          | Raw capture only, skip rendering               |
| `--no-headless`         | —          | Show the browser window                        |
| `--renderer <name>`     | `ffmpeg`   | Video renderer                                 |
| `--tts-provider <name>` | `kokoro`   | TTS: kokoro (local), openai, elevenlabs, piper |
| `--verbose`             | —          | Debug logging                                  |

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

Every action supports an optional `narration` field for TTS and most support `delay` to override the default post-action pause.

### Pacing

Control the feel of the demo globally. All fields are optional with sensible defaults:

```yaml
pacing:
  cursorDurationMs: 600 # cursor travel time
  typeDelayMs: 50 # ms between keystrokes
  postClickDelayMs: 500 # pause after clicks
  postTypeDelayMs: 300 # pause after typing
  postNavigateDelayMs: 1000 # pause after navigation
  settleDelayMs: 200 # micro-pause after every action
```

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
                    ┌──────────────┐
                    │  YAML Spec   │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ Spec Loader  │  Zod validation + defaults
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │   Runner     │  Spawn dev server, healthcheck
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │   Playback   │  Cursor animation, typing, pacing
                    │   Engine     │  Playwright browser automation
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │   Capture    │  Video recording + event log
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Timeline    │  Intro/outro, chapters, callouts
                    │  Builder     │  Dead-time compression
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │   FFmpeg     │  Overlays, fades, final MP4
                    │  Renderer    │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Narration   │  TTS + VTT/SRT subtitles
                    │  (optional)  │
                    └──────────────┘
```

### Project Structure

```
src/
  cli.ts              # CLI entry point
  index.ts            # Public API exports
  spec/               # YAML parsing + Zod validation
  runner/             # Dev server lifecycle
  playback/           # Cursor, typing, pacing engine
  capture/            # Playwright video recording
  editor/             # Timeline + ffmpeg renderer
  narration/          # TTS providers + subtitles
  redaction/          # Blur + secret scanning
  utils/              # Logger, process helpers
tests/                # 172 tests across 13 suites
examples/             # Example specs + demo apps
```

## Development

```bash
pnpm build          # Compile TypeScript
pnpm test           # Run 172 tests
pnpm lint           # ESLint
pnpm format         # Prettier check
pnpm typecheck      # tsc --noEmit
pnpm validate       # Run everything
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and development workflow.

## License

[MIT](LICENSE) — use it however you want.
