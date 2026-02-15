# demo-machine (Local Fork)

**Demo as code** with automatic narration synchronization.

This is a local fork of [demo-machine](https://github.com/45ck/demo-machine) with enhanced narration timing features.

## What's New: Auto-Sync Narration

### The Problem

The original demo-machine requires manual calculation of narration duration:

```yaml
- action: press
  key: "PageDown"
  delay: 6200 # ← Manually calculated to match narration!
  narration: "Scroll down to see more resources and time slots..."
```

This is error-prone and requires trial-and-error adjustments.

### The Solution

With auto-sync, demo-machine automatically adjusts delays:

```yaml
- action: press
  key: "PageDown"
  # delay omitted - calculated automatically!
  narration: "Scroll down to see more resources and time slots..."
```

## How It Works

1. **Pre-synthesis**: Before playback, demo-machine synthesizes all narration segments using your TTS provider
2. **Duration measurement**: Uses `ffprobe` to get exact audio duration for each segment
3. **Dynamic delays**: Playback engine automatically adjusts action delays to match narration
4. **Audio reuse**: Final video uses the pre-synthesized audio (no re-synthesis)

## Configuration

### Auto-Sync Mode (Default)

Automatically adjusts delays to match narration:

```yaml
meta:
  title: "My Demo"

narration:
  enabled: true
  provider: kokoro # Local TTS
  sync:
    mode: auto-sync # ← Automatic timing adjustment
    bufferMs: 500 # Natural pause after narration
```

### Manual Mode

Use YAML-specified delays (original behavior):

```yaml
narration:
  enabled: true
  sync:
    mode: manual # No automatic adjustment
```

### Warn-Only Mode

Check for timing issues without adjusting:

```yaml
narration:
  enabled: true
  sync:
    mode: warn-only # Logs warnings, doesn't adjust delays
```

## CLI Usage

### Run with Auto-Sync

```bash
demo-machine run demo.yaml --narration-sync auto-sync
```

### Disable Narration

```bash
demo-machine run demo.yaml --no-narration
```

### Custom Buffer Time

```bash
demo-machine run demo.yaml --narration-buffer 1000  # 1 second pause after narration
```

## Example Demo Spec

```yaml
meta:
  title: "Booking System Demo"
  resolution:
    width: 1920
    height: 1080

narration:
  enabled: true
  provider: kokoro
  sync:
    mode: auto-sync
    bufferMs: 500

pacing:
  cursorDurationMs: 600
  typeDelayMs: 50
  postClickDelayMs: 500
  # These are MINIMUM delays - auto-sync will extend if narration is longer

chapters:
  - title: "Login"
    steps:
      - action: navigate
        url: "http://localhost:3011"
        narration: "Welcome to the Macquarie College Booking System."

      - action: click
        selector: "#username"
        narration: "Let's log in as a teacher."

      - action: type
        selector: "#username"
        text: "teacher1"
        # No delay specified - auto-calculated from narration

      - action: click
        selector: "#password"

      - action: type
        selector: "#password"
        text: "password"
        narration: "Enter the password and sign in."

      - action: click
        selector: "#login-btn"
```

## Architecture Changes

### Pre-Synthesis Flow

```
YAML Spec
   ↓
Pre-Synthesize Narration (NEW)
   ├─ Extract narration text from all steps
   ├─ Synthesize with TTS provider
   ├─ Measure duration with ffprobe
   └─ Build timing map (action index → duration)
   ↓
Playback Engine (ENHANCED)
   ├─ For each action:
   │   ├─ Get default delay from pacing config
   │   ├─ Check if narration exists for this action
   │   ├─ If narration is longer: extend delay
   │   └─ If narration is shorter: use minimum delay
   └─ Execute action with adjusted delay
   ↓
Record Video + Events
   ↓
Mix Pre-Synthesized Audio (ENHANCED)
   └─ Reuse audio from pre-synthesis (no re-synthesis)
```

## Verification

After implementation, verify with:

```bash
cd apps/booking-system
pnpm demo:login --narration-sync auto
```

Expected output:

```
[INFO] Pre-synthesizing narration for timing...
[INFO] Synthesizing segment 1/10: "Welcome to the Macquarie College Booking..."
[INFO]   Duration: 3.2s
[INFO] Synthesizing segment 2/10: "Let's log in as a teacher."
[INFO]   Duration: 1.8s
...
[INFO] Pre-synthesis complete: 10 segments, total 45.2s
[INFO] Starting playback with narration-aware timing...
[INFO] Action 0 (navigate): delay adjusted to 3700ms (narration: 3.2s)
[INFO] Action 1 (click): delay adjusted to 2300ms (narration: 1.8s)
...
[INFO] Demo generated: output.mp4 (narration perfectly synced!)
```

## Performance

- **Pre-synthesis overhead**: ~10-30 seconds for typical demos (depends on number of narration segments)
- **Benefit**: Perfect sync without manual timing calculations
- **Trade-off**: Slightly longer generation time, but fully automated

## Backward Compatibility

✅ Existing YAML specs work unchanged
✅ `narration.enabled: false` → standard playback (no overhead)
✅ `narration.sync.mode: 'manual'` → uses YAML delays as-is
✅ No YAML modification required (runtime adjustment only)

## Migration from Original Demo-Machine

If you have existing demos with manually-calculated delays:

1. **Keep delays as minimums**: Auto-sync will extend if needed
2. **Remove delays**: Let auto-sync handle everything
3. **Use warn-only mode**: Check for timing issues before switching

Example migration:

**Before:**

```yaml
- action: click
  selector: "#btn"
  delay: 5200 # Manually calculated
  narration: "This is a long narration segment that explains the feature..."
```

**After:**

```yaml
- action: click
  selector: "#btn"
  # delay omitted - auto-sync calculates automatically
  narration: "This is a long narration segment that explains the feature..."
```

## Development

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm build

# Run tests
pnpm test

# Watch mode
pnpm dev
```

## Integration with Booking System

Update `apps/booking-system/package.json`:

```json
{
  "devDependencies": {
    "demo-machine": "workspace:*"
  }
}
```

Then:

```bash
pnpm install
```

## License

MIT (same as upstream demo-machine)
