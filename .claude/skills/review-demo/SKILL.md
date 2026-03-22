---
name: review-demo
description: AI quality review of a completed demo run. Analyzes event log, timing, and narration to flag issues and suggest improvements.
argument-hint: [spec-file-or-output-dir]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node *), Bash(pnpm *), Bash(ffprobe *)
---

# AI Demo Quality Review

After generating a demo video, review the event log, timing data, and narration to flag quality issues — like a human QA engineer reviewing the output.

## Input

- `$ARGUMENTS` can be:
  - A path to a `.demo.yaml` spec file (will look for output in `./output/`)
  - A path to an output directory containing `events.json`
  - If no arguments, look for `./output/events.json`

## Artifacts to Review

| File                              | What to Check                           |
| --------------------------------- | --------------------------------------- |
| `events.json`                     | Action timing, event flow, gaps, errors |
| `output.mp4`                      | Duration, resolution (via ffprobe)      |
| `subtitles.vtt` / `subtitles.srt` | Narration timing alignment              |
| `metadata.json`                   | Capture timing, overall duration        |
| `verification.json`               | Artifact completeness                   |
| The original spec file            | Step-to-event correlation               |

## Quality Checks

### 1. Timing Issues

- **Too fast** (<100ms per step): No visual feedback; viewers miss the action
- **Too slow** (>10 seconds): Viewers get bored; edit the spec to remove filler
- **Dead air** (>3s with no narration): Feels like a glitch; add narration or trim the gap

### 2. Coverage

- Are all key actions narrated? (Aim for 70–80%)
- Are trivial steps (waits, screenshots, intermediate clicks) skipped?
- Does narration explain _why_ each action matters, not just _what_ happens?

### 3. Flow

- **Chapter length**: 3–8 steps per chapter (too few = feels incomplete; too many = overwhelming)
- **Pacing consistency**: Does narration timing match the action timing?
- **Story coherence**: Does the narration read as a single narrative, not isolated snippets?

### 4. Narration Quality

- **Word count**: 5–15 words per step (too long = truncated by TTS; too short = feels rushed)
- **Grammar**: Natural phrasing for TTS (avoid abbreviations, special characters)
- **Tense**: Present/future ("Let's click..."), not past ("We clicked...")
- **Jargon**: Avoid technical terms unless the audience is developers

### 5. Duration & Resolution

- **Total length**: Ideal 1–3 minutes
  - <30 seconds: Too short, probably incomplete
  - > 5 minutes: Too long, probably includes filler
- **Resolution**: Should match spec (typically 1920x1080)
- **Frame rate**: Should be stable (15–30 fps typical)

## Review Output Structure

When reviewing, structure your findings as:

1. **Summary** (2–3 sentences)
   - What the demo does, overall quality (good/needs work)

2. **Critical Issues** (if any)
   - Missing steps, broken narration, dead air, timing errors
   - These block the demo from being used

3. **Warnings** (medium priority)
   - Awkward pacing, unclear narration, chapter imbalance
   - Demo works but could be better

4. **Suggestions** (low priority)
   - Minor edits, tone adjustments, optional improvements

## Example Review

```
Summary:
The task creation demo is well-structured and mostly ready, but has
two issues: a gap between adding the task and verifying it, and narration
on the "wait" step is unnecessary.

Critical Issues:
1. Dead air (2.5s) between "Click Add" and assertion — consider trimming
   the wait or adding intermediate narration.
2. Narration on wait step ("Waiting for task to appear...") should be
   moved to the assertion step instead.

Warnings:
1. Opening chapter is only 2 steps — could add a "Getting Started" intro
   to set context.
2. Narration on "type task name" is 18 words (slightly long for TTS).

Suggestions:
1. Consider adding a final chapter showing task deletion for completeness.
2. Chapter titles could be more action-oriented ("Completing a Task"
   vs. "Task Completion").
```

## Automated Checks

Use these commands to extract data:

```bash
# Extract event timing
cat output/events.json | jq '.[] | {action: .action, duration: .durationMs}' | head -20

# Check video resolution and duration
ffprobe -v error -show_format -show_streams output/output.mp4 | grep -E "width|height|duration"

# Extract narration timing
cat output/subtitles.vtt | head -30
```

Arguments: $ARGUMENTS
