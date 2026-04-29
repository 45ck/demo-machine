<div align="center">

# demo-machine

<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://github.com/45ck/demo-machine/raw/master/assets/banner.dark.png"
  />
  <source
    media="(prefers-color-scheme: light)"
    srcset="https://github.com/45ck/demo-machine/raw/master/assets/banner.light.png"
  />
  <img
    src="https://github.com/45ck/demo-machine/raw/master/assets/banner.light.png"
    alt="demo-machine banner"
    width="100%"
  />
</picture>

**Demo as code**: turn versioned specs into repeatable browser captures and polished product demo videos.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/demo-machine)](https://www.npmjs.com/package/demo-machine)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/Tests-passing-brightgreen)](tests/)
[![Playwright](https://img.shields.io/badge/Playwright-Browser%20Automation-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Video%20Rendering-007808?logo=ffmpeg&logoColor=white)](https://ffmpeg.org)

[Quick Start](#quick-start) &bull; [Docs](docs/README.md) &bull; [CLI](docs/cli-reference.md) &bull; [Spec](docs/spec-reference.md) &bull; [MCP](docs/mcp.md) &bull; [Roadmap](ROADMAP.md)

</div>

---

## What It Does

demo-machine reads a `.demo.yaml` spec, launches your app, drives a real browser with Playwright, records the run, and renders a polished MP4.

Use it when you want product demos that are:

- Repeatable instead of manually re-recorded.
- Version-controlled next to app code.
- Narrated, with smooth cursor motion, zoom-focused camera framing, readable click feedback, and clean zoom-out transitions.
- Reviewable through artifacts like traces, screenshots, manifests, and quality reports.
- Analyzer-ready: completed runs can be packaged into review artifacts without recapture or rerender.
- AI-assisted through the built-in MCP server.

It is local-first. There is no required cloud service and no current CI dependency.

## Demo

The main showcase video was generated from [examples/assurance/long-demo/long-demo.demo.yaml](examples/assurance/long-demo/long-demo.demo.yaml):

[![AssuranceOps showcase video preview](https://github.com/45ck/demo-machine/raw/master/assets/demo-gallery/assurance-long-demo-poster.webp)](https://github.com/45ck/demo-machine/raw/master/assets/demo-gallery/assurance-long-demo.mp4)

Open the [narrated AssuranceOps showcase video](https://github.com/45ck/demo-machine/raw/master/assets/demo-gallery/assurance-long-demo.mp4). More rendered examples are in the [demo gallery](docs/demo-gallery.md).

The showcase demonstrates the current quality bar: narration leads into the action, the cursor moves to the element being discussed, the camera zooms into the relevant UI instead of a generic region, the real click or typing action lands while framed, and the view eases back out before the next beat.

## Quick Start

```bash
git clone https://github.com/45ck/demo-machine.git
cd demo-machine
pnpm install
pnpm exec playwright install chromium
pnpm build
node dist/cli.js run examples/showcase/todo-app.demo.yaml --no-headless
```

Requirements:

- Node.js >= 22
- pnpm
- FFmpeg on your `PATH`
- Chromium installed through Playwright

The rendered video is written to a safe per-run folder:

```text
output/todo-app/<run-id>/output.mp4
```

For a slower walkthrough, use [Getting Started](GETTING-STARTED.md). For every command and option, use the [CLI reference](docs/cli-reference.md).

## Basic Commands

```bash
# Full pipeline: capture + render + quality checks
demo-machine run <spec.yaml>

# Validate before spending time on capture
demo-machine validate <spec.yaml>

# Create a starter spec
demo-machine init my-product.demo.yaml --url http://localhost:3000 --command "pnpm dev"

# Capture only
demo-machine capture <spec.yaml>

# Re-render from a previous capture
demo-machine edit <output-dir>/events.json

# Analyze an existing run for review artifacts
demo-machine analyze <output-dir>
demo-machine analyze --latest --spec <spec.yaml>

# Find examples to copy from
demo-machine examples list
demo-machine examples show controls-lab

# Check local dependencies
demo-machine doctor
```

## Examples

Example specs are organized by purpose:

- `examples/showcase/`: polished demos used by the docs and gallery.
- `examples/proof/actions/`: small action-level playback proofs.
- `examples/proof/variants/`: redaction and narration-sync coverage variants.
- `examples/assurance/long-demo/`: a longer realistic QA flow for full-video assurance.

`examples/manifest.json` is the source of truth for discovery and suite tooling. `demo-machine examples list` reads that manifest and, by default, shows showcase and assurance specs. Use `--type proof` for action fixtures, `--type all` for every manifest entry, and filters such as `--tag`, `--signal`, `--tier`, or `--search` to narrow the table. `demo-machine examples show <slug>` prints the canonical spec path, variants, quality signals, and runnable `run` and `validate` commands.

## How It Works

```text
spec file
  -> validate
  -> start app
  -> drive browser
  -> capture video + events + trace + screenshots
  -> render MP4
  -> write verification + quality artifacts
  -> optionally analyze completed run for review artifacts
```

Default runs write to `output/<spec-slug>/<run-id>` and update `output/latest.json`. If you pass `--output <dir>`, demo-machine uses that exact directory and refuses to overwrite known demo artifacts unless you also pass `--overwrite`.

Key artifacts:

- `output.mp4`: rendered demo video
- `video.webm`: raw browser recording
- `events.json`: captured action timeline
- `verification.json`: capture proof and artifact contract
- `environment.json`: runtime/browser context
- `quality.json`: post-render checks
- `trace.zip`: Playwright trace for debugging

`demo-machine analyze <output-dir>` runs after a capture/render has completed.
It uses the rendered `output.mp4` or raw `video.webm` and writes analyzer
artifacts beside the run without changing the capture. Current analyzer outputs
include `review-bundle.json`, `review-prompt.md`, `video.shots.json`,
`segment.evidence.json`, `layout-safety.report.json`, and
`segment-storyboard/` files. Pass `--spec <path>` to include the source spec in
the review prompt, `--video <path>` to analyze a standalone video, `--layout
<path>` to include layout annotations, or `--no-ocr` when OCR-backed storyboard
steps are not available locally.

When analyzer artifacts are present beside the rendered video, the post-render
quality gate reads `layout-safety.report.json`, `segment.evidence.json`, and
`review-bundle.json` and emits their findings inside the normal `quality.json`
result shape. Missing analyzer artifacts are allowed; they make the review less
evidence-backed but do not fail a normal run by themselves.

## Spec Example

```yaml
meta:
  title: "My Product Demo"

runner:
  command: "pnpm dev"
  url: "http://localhost:3000"
  healthcheck: "http://localhost:3000/health"

chapters:
  - title: "First look"
    steps:
      - action: navigate
        url: "/"
      - action: click
        target:
          by: role
          role: button
          name: "Get Started"
      - action: screenshot
        name: first-screen
```

Prefer structured targets such as `role`, `label`, `text`, and `testId` before raw CSS selectors. See the [spec reference](docs/spec-reference.md) for all fields, actions, targets, narration, and redaction.

## AI / MCP

demo-machine includes an MCP server so AI assistants can help create, validate, run, review, and repair demos.

```json
{
  "mcpServers": {
    "demo-machine": {
      "command": "npx",
      "args": ["demo-machine-mcp"]
    }
  }
}
```

The MCP server exposes 5 tools, 4 resources, and 8 prompts. See the [MCP guide](docs/mcp.md) for the full list.

The repo also includes agent skill files for Claude Code-style workflows under `.claude/skills/`, and `pnpm qa:meta-prompt` creates a fresh Codex-ready workspace with a local Demo Machine skill and prompt. In practice, you can ask a coding agent to inspect an app, write the `.demo.yaml`, run Demo Machine, analyze the completed output, review the generated `review-prompt.md`, `quality.json`, and MP4, and iterate until narration, zoom focus, cursor motion, and visual quality are clean.

## Local Quality

```bash
pnpm validate
pnpm local-ready
pnpm release-ready:fast
pnpm release-ready
pnpm examples:validate -- --no-build
pnpm examples:smoke:pr -- --limit 2
pnpm release:gates:showcase
pnpm video:assure -- --filter assurance-long-demo
pnpm golden-frames:compare
pnpm visual-diff
pnpm qa:meta-prompt
```

`pnpm validate` runs lint, formatting, spelling, typecheck, tests, dependency checks, and strict verification inventory checks. `pnpm local-ready` adds build and example validation. `pnpm release-ready:fast` adds release gates without rendering smoke videos, while `pnpm release-ready` runs the heavier PR-tier capture/render smoke and video assurance. `pnpm examples:validate` validates manifest-backed specs, and `pnpm video:assure` scans rendered MP4 outputs for blank frames, frozen spans, and large visual jumps after rendered example outputs exist.

`pnpm local-ready` is the expected local handoff gate for ordinary code and doc
changes. It does not refresh visual baselines. Use `pnpm golden-frames` to
extract five key-frame baselines per rendered demo, `pnpm
golden-frames:compare` or `pnpm visual-diff` to compare current renders against
`baselines/golden-frames`, and the corresponding update commands only after a
human has accepted the visual change.

`pnpm release:gates:showcase` protects the public-facing demo surface: the README must link the approved MP4 and poster, the main long-demo suite must stay manifest-backed with narration/cursor/selector quality signals, and the curated gallery must keep at least 10 high-quality entries with GIFs, frame captures, and durations.

`pnpm qa:meta-prompt` creates a fresh complex fixture project plus a Demo Machine Codex skill and prompt. Use `pnpm qa:meta-prompt:run` when you want Codex CLI to create narrated demos, cover the action/component matrix, run Demo Machine, self-evaluate, and produce a human review page at `output/meta-prompt-qa/review.html`.

## Learn More

The [documentation index](docs/README.md) groups the docs by workflow: first run, spec authoring, agent workflows, examples, quality gates, and release assurance.

Common entry points:

- [Getting Started](GETTING-STARTED.md): first run, starter specs, and validation flow.
- [Demo Anything](docs/demo-anything.md): authoring principles, target selection, example matrix, and the new-app playbook.
- [MCP Integration](docs/mcp.md): AI assistant tools, resources, prompts, and agent setup.
- [Verification Matrix](docs/verification-matrix.md): what local checks prove and how coverage is tracked.
- [Contributing](CONTRIBUTING.md), [Releasing](RELEASING.md), and [Security](SECURITY.md): project operations.

## License

[MIT](LICENSE)
