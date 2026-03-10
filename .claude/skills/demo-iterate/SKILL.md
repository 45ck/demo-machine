---
name: demo-iterate
description: Iteratively refine a demo spec through run-review-fix cycles until the output is satisfactory.
argument-hint: [spec-file]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node *), Bash(pnpm *), Bash(ffprobe *)
---

# Iterative Demo Refinement

Guide an iterative run-review-fix-rerun cycle to polish a demo spec.

## Input

- `$ARGUMENTS` should be a path to an existing `.demo.yaml` file.

## Cycle

### 1. Run

```bash
node dist/cli.js run <spec> --output ./output --no-headless --verbose
```

### 2. Review

- Check `output/output.mp4` for visual quality
- Check `output/events.json` for timing and event flow
- Check `output/subtitles.vtt` for narration alignment
- Use `ffprobe output/output.mp4` to verify resolution and duration

### 3. Diagnose Issues

- **Too fast**: Increase `delay` on steps, add `wait` steps
- **Too slow**: Reduce delays, remove unnecessary waits
- **Missed element**: Update selector, add scroll or wait before click
- **Narration overlap**: Shorten narration text or increase `narrationBuffer`
- **Wrong timing**: Switch to `auto-sync` narration mode
- **Visual glitch**: Add `wait` after animations, increase `settleDelayMs`

### 4. Fix

Apply targeted changes to the spec file based on the diagnosis.

### 5. Rerun

Run again and compare with the previous output.

## Tips

- Make one change at a time to isolate improvements
- Use `--no-narration` to debug visual issues without TTS overhead
- Use `--no-edit` (capture only) to speed up iteration on selectors
- Check `failure.json` and `failure.png` if the run crashes
- Keep the previous output for comparison before each rerun

Arguments: $ARGUMENTS
