---
name: demo-debug
description: Debug a failing demo-machine spec. Use when a demo capture or pipeline run fails with errors.
argument-hint: [spec-file-or-error-message]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node *), Bash(pnpm *)
---

# Debug a Demo Spec

Diagnose and fix failures in demo-machine spec runs.

## Input

- If `$ARGUMENTS` is a spec file path, read and analyze it.
- If `$ARGUMENTS` is an error message, diagnose the root cause.
- Check `output/failure.json`, `output/failure.png`, `output/failure.html` for artifacts.

## Decision Tree

### Selector Not Found

- **Symptom**: `TimeoutError: locator.waitFor` or `locator.click`
- **Fix**: Open the app, inspect the element, update the selector. Add a `wait` step before if the element appears after an animation.

### Navigation Timeout

- **Symptom**: `TimeoutError` on `page.goto`
- **Fix**: Check that `runner.url` matches the actual app URL. Increase `runner.timeout`. Ensure the dev server is starting correctly.

### Runner Failed to Start

- **Symptom**: `Runner failed` or `ENOENT` errors
- **Fix**: Verify `runner.command` works in a terminal. Check that dependencies are installed.

### Element Not Visible

- **Symptom**: `expected ... to be visible` assertion failure
- **Fix**: The element may be behind a modal, offscreen, or not yet rendered. Add a `wait` step or scroll to it first.

### Narration/TTS Errors

- **Symptom**: `TTS synthesis failed` or audio errors
- **Fix**: Check `--tts-provider` is available. Try `--no-narration` to isolate the issue. For kokoro, ensure the model downloaded.

### FFmpeg Errors

- **Symptom**: `ffmpeg` process errors during rendering
- **Fix**: Run `demo-machine doctor` to verify ffmpeg is installed. Check that the video file exists in the output directory.

## Steps

1. Read the spec file and any failure artifacts
2. Identify which category the error falls into
3. Apply the suggested fix
4. Validate: `node dist/cli.js validate <spec>`
5. Re-run: `node dist/cli.js run <spec> --output ./output --no-headless`

Arguments: $ARGUMENTS
