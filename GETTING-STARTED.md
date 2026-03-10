# Getting Started with Auto-Sync Narration

## Quick Start

The auto-sync feature eliminates manual timing calculations in your demo specs. Just write the narration text, and demo-machine automatically adjusts delays to match.

## Before Auto-Sync (Manual)

```yaml
- action: press
  key: "PageDown"
  delay: 6200 # ← Had to manually calculate this!
  narration: "Scroll down to see more resources..."
```

**Problem**: Trial-and-error to find the right delay value. If narration changes, delay must be recalculated.

## After Auto-Sync (Automatic)

```yaml
narration:
  enabled: true
  sync:
    mode: auto-sync # ← Enable auto-sync

steps:
  - action: press
    key: "PageDown"
    # No delay specified - calculated automatically!
    narration: "Scroll down to see more resources..."
```

**Solution**: demo-machine pre-synthesizes narration, measures duration, and adjusts delays at runtime.

## How to Enable

### Option 1: YAML Configuration

Add to your demo spec:

```yaml
meta:
  title: "My Demo"

narration:
  enabled: true
  provider: kokoro # or openai, elevenlabs, piper
  sync:
    mode: auto-sync
    bufferMs: 500 # Lead-in pause between narration end and the action (optional, default: 500)

pacing:
  # These are MINIMUM delays - auto-sync will extend if needed
  postClickDelayMs: 500
  postTypeDelayMs: 300
```

### Option 2: CLI Flags

```bash
demo-machine run demo.yaml --narration-sync auto-sync --narration-buffer 500
```

## Modes

### `auto-sync` (Recommended)

Automatically adjusts delays to match narration duration.

```yaml
narration:
  sync:
    mode: auto-sync
```

**When to use**: Always, unless you need precise manual control.

### `manual` (Original Behavior)

Uses YAML-specified delays without adjustment.

```yaml
narration:
  sync:
    mode: manual

steps:
  - action: click
    delay: 3500 # Must specify manually
    narration: "..."
```

**When to use**: Fine-tuning specific timings after auto-sync gets you 95% there.

### `warn-only` (Debugging)

Checks timing but doesn't adjust delays. Logs warnings if narration is longer than specified delay.

```yaml
narration:
  sync:
    mode: warn-only
```

**When to use**: Debugging timing issues, migrating from manual to auto-sync.

## Example Demos

### Simple Demo

```yaml
meta:
  title: "Todo App Demo"

narration:
  enabled: true
  sync:
    mode: auto-sync

chapters:
  - title: "Add Task"
    steps:
      - action: navigate
        url: "http://localhost:3000"
        narration: "Welcome to the todo app."

      - action: click
        selector: "#new-task"
        narration: "Click to add a new task."

      - action: type
        selector: "#task-input"
        text: "Buy groceries"
        narration: "Type the task description."

      - action: click
        selector: "#save"
        narration: "Save the task to the list."
```

### Booking System Demo

See: `apps/booking-system/demos/01-login-and-schedule-autosync.demo.yaml`

This is a real-world example comparing manual vs auto-sync:

- Original: 8600ms manually calculated delay
- Auto-sync: Delay omitted, calculated automatically

## Testing

### 1. Build the Package

```bash
cd packages/demo-machine
pnpm build
```

### 2. Run Test Demo

```bash
node dist/cli.js run examples/test-autosync.demo.yaml --no-headless --verbose
```

**Expected output**:

```
[INFO] Loading spec: examples/test-autosync.demo.yaml
[INFO] Pre-synthesizing narration for timing...
[INFO] Synthesizing segment 1/8: "Short narration."
[INFO]   Duration: 1.2s
[INFO] Synthesizing segment 2/8: "This is a slightly longer..."
[INFO]   Duration: 4.8s
[INFO] Pre-synthesis complete: 8 segments, total 32.4s
[INFO] Launching browser...
[INFO] Starting playback with narration-aware timing...
[INFO] Action 0 (navigate): delay adjusted to 1700ms (narration: 1.2s)
[INFO] Action 1 (wait): delay adjusted to 5300ms (narration: 4.8s)
...
```

### 3. Validate Spec

Check if your spec is valid before running:

```bash
node dist/cli.js validate demo.yaml
```

Output:

```
✓ Spec is valid
  Title: My Demo
  Chapters: 3
  Total steps: 12
  Narration: enabled (kokoro)
  Sync mode: auto-sync
```

## How It Works Under the Hood

```
1. Load YAML spec
   ↓
2. Extract all narration text
   ↓
3. Pre-synthesize with TTS (Kokoro, OpenAI, etc.)
   ├─ Generate audio file for each segment
   └─ Measure duration with ffprobe
   ↓
4. Build timing map: action index → duration
   ↓
5. Run playback with narration-aware delays
   For each action:
   ├─ Get default delay from YAML or pacing config
   ├─ Check if narration exists
   ├─ Actual delay = max(default, narration_duration + buffer)
   └─ Wait for actual delay
   ↓
6. Mix pre-synthesized audio into video
   └─ Reuse audio from step 3 (no re-synthesis!)
```

## Configuration Reference

```yaml
narration:
  enabled: boolean # Enable narration (default: true)
  provider: string # TTS provider: kokoro, openai, elevenlabs, piper
  voice: string # Voice ID (provider-specific)
  sync:
    mode: string # auto-sync, manual, warn-only
    bufferMs: number # Lead-in pause between narration end and the action (ms, default: 500)
```

## Troubleshooting

### "No narration segments found"

Your spec has `narration.enabled: true` but no `narration` fields on steps.

**Fix**: Add narration to at least one step:

```yaml
- action: click
  narration: "Click the button." # ← Add this
```

### "Delay too short" warnings

In `warn-only` mode, you'll see warnings like:

```
[WARN] Action 5: delay 2000ms is shorter than narration 4.5s
```

**Fix**: Either switch to `auto-sync` mode, or increase the delay manually.

### "ffprobe not found"

Auto-sync requires ffprobe to measure audio duration.

**Fix**: Install FFmpeg:

- **macOS**: `brew install ffmpeg`
- **Windows**: Download from ffmpeg.org
- **Linux**: `apt-get install ffmpeg`

## Performance Notes

- **Pre-synthesis overhead**: ~10-30 seconds for typical demos
- **Benefit**: No manual timing, perfect sync every time
- **Caching** (future): Pre-synthesized audio can be cached and reused

## Migration Guide

### From Manual Delays to Auto-Sync

1. **Add narration config**:

```yaml
narration:
  enabled: true
  sync:
    mode: auto-sync
```

2. **Remove manual delays** (optional):

```yaml
# Before
- action: click
  delay: 3500
  narration: "..."

# After
- action: click
  narration: "..." # delay removed
```

3. **Keep pacing config as minimums**:

```yaml
pacing:
  postClickDelayMs: 500 # Used when no narration
```

4. **Test**:

```bash
demo-machine run demo.yaml --verbose
```

5. **Verify logs** show timing adjustments:

```
[INFO] Action 3 (click): delay adjusted to 3800ms (narration: 3.3s)
```

## Next Steps

- See `README.md` for feature overview
- See `IMPLEMENTATION.md` for architecture details
- See `examples/test-autosync.demo.yaml` for test cases
- See `apps/booking-system/demos/*-autosync.demo.yaml` for real-world examples

## Support

This is a local fork of demo-machine with auto-sync features. For issues:

1. Check existing demos in `examples/`
2. Review implementation docs in `IMPLEMENTATION.md`
3. Test with `--verbose` flag for detailed logs
