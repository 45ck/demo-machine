---
name: demo
description: Generate a polished product demo video from a YAML spec using demo-machine. Use when the user wants to create, run, or update a demo video for their app.
argument-hint: [spec-file-or-description]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node *), Bash(pnpm *), Bash(ffprobe *)
---

# Generate a Demo Video

Create and run demo-machine YAML specs to produce polished product demo videos with smooth cursor movement, natural typing, voice narration, and chapter overlays.

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

| Action       | Required Fields    | Description                            |
| ------------ | ------------------ | -------------------------------------- |
| `navigate`   | `url`              | Go to a URL                            |
| `click`      | `selector`         | Click an element                       |
| `type`       | `selector`, `text` | Type text character-by-character       |
| `hover`      | `selector`         | Hover over an element                  |
| `scroll`     | —                  | Scroll (`selector`, `x`, `y` optional) |
| `wait`       | `timeout`          | Pause for milliseconds                 |
| `press`      | `key`              | Press a keyboard key                   |
| `screenshot` | —                  | Take a screenshot                      |

Every action supports an optional `narration` field for voice-over.

## Steps

1. **If creating a new spec**: Write a `.demo.yaml` file with chapters and steps that walk through the app's key features. Add `narration` text to important steps. Place narration on the step BEFORE the action you're describing (narration leads into the action).

2. **Validate** the spec:

   ```bash
   node dist/cli.js validate <spec.yaml>
   ```

3. **Run** the full pipeline:

   ```bash
   node dist/cli.js run <spec.yaml> --output ./output --no-headless
   ```

4. Report the output path and any errors.

## Tips

- Use CSS selectors that are stable (IDs > data attributes > classes)
- Add `wait` steps after actions that trigger animations
- Keep narration text concise — it's spoken aloud
- Narration is placed to finish just as the action happens, so write it as a lead-in ("Let's click..." not "We clicked...")
- Use `--no-narration` flag to skip TTS if not needed
- Use `--verbose` to debug issues

Arguments: $ARGUMENTS
