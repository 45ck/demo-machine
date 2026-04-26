---
name: demo
description: Generate a polished product demo video from a YAML spec using demo-machine. Use when the user wants to create, run, or update a demo video for their app.
argument-hint: [spec-file-or-description]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node *), Bash(pnpm *), Bash(ffprobe *)
---

# Generate a Demo Video

Create and run demo-machine YAML specs to produce polished product demo videos with smooth cursor movement, natural typing, voice narration, zoom-focused camera movement, and chapter overlays.

## Input

- If `$ARGUMENTS` is a path to an existing `.demo.yaml` file, run it.
- If `$ARGUMENTS` is a description, create a new spec file then run it.
- If no arguments, look for `*.demo.yaml` files in the project.

## Spec Format

A demo spec has this structure:

```yaml
meta:
  title: "My App Demo"
  resolution:
    width: 1920
    height: 1080

runner:
  command: "npm run dev" # command to start your app
  url: "http://localhost:3000" # URL to wait for
  timeout: 10000 # ms to wait for app to be ready

pacing:
  cursorDurationMs: 600 # cursor travel time
  typeDelayMs: 50 # ms between keystrokes
  postClickDelayMs: 500 # pause after clicks
  postTypeDelayMs: 300 # pause after typing
  postNavigateDelayMs: 1000 # pause after navigation

presentation:
  narrationFocus:
    enabled: true
    cursor: true
    highlight: false
    zoom: true
    scale: 1.25
    durationMs: 1600
    transitionMs: 450

chapters:
  - title: "Chapter Name"
    steps:
      - action: navigate
        url: "http://localhost:3000"
        narration: "Welcome to the app."
      - action: click
        selector: "#my-button"
        narration: "Click this button to get started."
      - action: type
        selector: "#input-field"
        text: "Hello world"
        narration: "Type some text into the field."
      - action: wait
        timeout: 1000
```

### Available Actions

| Action             | Required Fields        | Description                                     |
| ------------------ | ---------------------- | ----------------------------------------------- |
| `navigate`         | `url`                  | Go to a URL                                     |
| `click`            | `selector` or `target` | Click an element                                |
| `type`             | `selector` or `target` | Type text character-by-character                |
| `hover`            | `selector` or `target` | Hover over an element                           |
| `scroll`           | —                      | Scroll the page or a target container           |
| `press`            | `key`                  | Press a keyboard key                            |
| `assert`           | `selector` or `target` | Assert visibility, text, or value               |
| `check`/`uncheck`  | `selector` or `target` | Set checkbox/toggle state                       |
| `select`           | `selector` or `target` | Select an option by value, label, or index      |
| `upload`           | `selector` or `target` | Upload one or more files                        |
| `dragAndDrop`      | `from`, `to`           | Drag from one element to another                |
| `back` / `forward` | —                      | Navigate browser history                        |
| `wait`             | `timeout`              | Pause for milliseconds                          |
| `screenshot`       | —                      | Capture a named screenshot for review artifacts |

Every action supports an optional `narration` field for voice-over. For narrated product demos, prefer cursor plus zoom focus by default. Reserve persistent highlight rings for rare cases where zoom alone cannot identify the target; keep the real click pulse visible for action feedback.

## MCP Tools

When connected via MCP, the following tools are available:

- `validate-spec` — validate a spec file and get a summary
- `run-pipeline` — run the full capture + edit + narrate pipeline
- `capture-spec` — capture raw video only (no editing)
- `list-voices` — list configured TTS voices
- `format-spec` — convert a spec between JSON and YAML

Use `demo-machine://templates/basic` resource for a starter template.

## Steps

1. **If creating a new spec**: Write a `.demo.yaml` file with chapters and steps that walk through the app's key features. Add `narration` text to important steps. Place narration on the step BEFORE the action you're describing (narration leads into the action).

2. **Build local checkout if needed**:

   ```bash
   pnpm build
   ```

3. **Validate** the spec:

   ```bash
   node dist/cli.js validate <spec.yaml>
   ```

4. **Run** the full pipeline:

   ```bash
   node dist/cli.js run <spec.yaml> --no-headless
   ```

   Use an explicit per-demo `--output <folder>` only for deliberate handoffs, and add `--overwrite` only when rerunning that same folder intentionally.

5. Report the output path and any errors.

## Tips

- Prefer structured `target` locators: `testId`, role, label, placeholder, title, alt text, or text. Use CSS selectors only when there is no stable semantic locator.
- Add `wait` steps after actions that trigger animations
- Keep narration text concise — it's spoken aloud
- Narration is placed to finish just as the action happens, so write it as a lead-in ("Let's click..." not "We clicked...")
- Narrated focus should zoom into the exact target being discussed, move the cursor there, perform the real click/type/select while framed, then animate back out before the next beat.
- Avoid double-click-looking interactions: if a popover needs to close, prefer `Escape`, click-away, or a non-narrated close step instead of clicking the same trigger again.
- Watch the rendered MP4 and inspect `events.json`, `narration-segments.json`, and `quality.json`; logs alone are not enough to accept a demo.
- Use `--no-narration` flag to skip TTS if not needed
- Use `--verbose` to debug issues

Arguments: $ARGUMENTS
