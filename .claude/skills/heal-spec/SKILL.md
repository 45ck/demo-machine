---
name: heal-spec
description: Automatically fix a broken demo-machine spec by analyzing failure artifacts (screenshots, DOM, error logs). Use when a demo fails after a UI change.
argument-hint: <spec-file> [--output-dir ./output]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node *), Bash(pnpm *), Bash(npx *)
---

# Self-Healing Demo Specs

When a demo spec fails (selector not found, assertion failed, navigation error), analyze the failure context and automatically fix the spec. This turns UI changes from demo-breaking events into auto-resolved patches.

## Input

- `$ARGUMENTS` should include a path to the failing `.demo.yaml` spec file.
- Optional `--output-dir` to specify where failure artifacts are (default: `./output`).
- If no arguments, look for `*.demo.yaml` files and recent failure artifacts.

## Failure Artifacts

Demo-machine produces these artifacts on failure (check the output directory):

| File           | Contents                                                    |
| -------------- | ----------------------------------------------------------- |
| `failure.json` | Error details: step index, chapter, selector, error message |
| `failure.png`  | Screenshot at the moment of failure                         |
| `failure.html` | Full page HTML at the moment of failure                     |
| `events.json`  | All successful action events before the failure             |
| `trace.zip`    | Playwright trace (open with `npx playwright show-trace`)    |

## Diagnosis Strategy

### 1. Read the failure context

- Parse `failure.json` for the error type, failed step, and selector
- Read `failure.html` to understand the current page DOM
- View `failure.png` to see the visual state at failure
- Read the spec to understand what was intended

### 2. Classify the failure

| Failure Type               | Signal                                | Likely Fix                                                   |
| -------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| **Selector changed**       | `TimeoutError` on `locator.waitFor`   | Update CSS selector or switch to `target` (role/text/testId) |
| **Text changed**           | `assert` step fails text match        | Update expected text in assertion                            |
| **Element moved**          | Selector exists but action fails      | Element may need scroll, wait, or updated selector path      |
| **New modal/overlay**      | Click intercepted or element obscured | Add a dismiss step before the failing action                 |
| **Page structure changed** | Multiple selectors broken             | Larger refactor — update chapter steps                       |
| **Timing issue**           | Intermittent failures                 | Add `wait` step or increase `timeoutMs`                      |
| **URL changed**            | Navigation error                      | Update `navigate` URL and `runner.url`                       |

### 3. Fix Strategy

**Prefer resilient selectors**: When fixing a broken CSS selector, upgrade to a `target` block:

```yaml
# Before (fragile)
- action: click
  selector: ".btn-primary.submit-form"

# After (resilient)
- action: click
  target:
    by: role
    role: button
    name: "Submit"
```

**Selector priority** (most to least stable):

1. `by: testId` — `data-testid` attributes (most stable)
2. `by: role` + `name` — ARIA roles (accessible, stable)
3. `by: label` — Form labels (stable for form elements)
4. `by: text` — Visible text (stable if text doesn't change often)
5. `selector` (CSS) — Last resort, most fragile

### 4. Verify the fix

After applying changes:

```bash
node dist/cli.js validate <spec.yaml>
```

Then attempt a re-run:

```bash
node dist/cli.js run <spec.yaml> --output ./output --no-headless --verbose
```

## Steps

1. **Read** the spec file and all available failure artifacts (`failure.json`, `failure.html`, `failure.png`, `events.json`)
2. **Classify** the failure type based on the error and DOM state
3. **Locate** the correct element in the current DOM (`failure.html`) — find what the selector _should_ be now
4. **Fix** the spec: update selectors, add waits, fix assertions, or restructure steps as needed
5. **Validate** the spec: `node dist/cli.js validate <spec.yaml>`
6. **Re-run** if possible: `node dist/cli.js run <spec.yaml> --output ./output --no-headless`
7. **Report** what changed and why, including the old vs. new selector/step

## Example Fix

**Error**: `TimeoutError: locator.waitFor: Timeout 5000ms exceeded. Waiting for locator('.submit-btn')`

**Analysis of `failure.html`**: Button text changed from "Submit" to "Save Changes", class changed from `submit-btn` to `btn-save`.

**Fix applied**:

```yaml
# Before
- action: click
  selector: ".submit-btn"
  narration: "Click Submit to save."

# After
- action: click
  target:
    by: role
    role: button
    name: "Save Changes"
  narration: "Click Save Changes to persist our updates."
```

Arguments: $ARGUMENTS
