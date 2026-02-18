# Demo Anything: Principles And Test Matrix

This repo’s goal is to generate **high-polish, repeatable product demos** from a spec, across many kinds of web applications.

## Design Principles

1. **Target intent, not implementation**
   - Prefer `target` locators (role/label/testId/text) over brittle CSS.
2. **Be deterministic**
   - Specs should drive stable demo data, stable URLs, and stable UI states.
3. **Make the audience track the story**
   - The cursor and overlays should clearly “select” targets before interaction.
4. **Fail with artifacts**
   - When a step fails, capture enough evidence to fix it quickly: trace, screenshot, HTML, and the step context.

## Supported Step Primitives

All primitives support optional `timeoutMs`, `delay`, and `narration` (where applicable).

- `navigate`: load a URL (absolute or relative to `runner.url`)
- `click`: click an element
- `type`: click and type text using keyboard events (supports `clear: true`)
- `hover`: hover an element
- `scroll`: scroll the window, or scroll a specific container (`selector` or `target`)
- `press`: press a key (e.g. `Enter`, `Escape`, `PageDown`)
- `back` / `forward`: navigate browser history
- `assert`: assert `visible` state and/or that `text` is included
- `screenshot`: capture a screenshot (optional `name`)
- `check` / `uncheck`: set checkbox/toggle state
- `select`: select an option in a `<select>` via `option.value` / `option.label` / `option.index`
- `upload`: set files on an `<input type="file">` (`file` or `files`)
- `dragAndDrop`: drag from one target to another (`from`, `to`)

## Targeting Rules Of Thumb

Use this order unless you have a strong reason not to:

1. `target.by: role` (stable and aligns with accessibility)
2. `target.by: testId` (stable for tests/demos if your app has them)
3. `target.by: label` / `placeholder` / `title` / `altText` (stable for forms and icon buttons)
4. `target.by: text` (ok for menus and headings; can be ambiguous)
5. `target.by: css` / raw `selector` (last resort)

### Disambiguation

If there are multiple matches, add `nth` (0-based):

```yaml
- action: click
  target:
    by: role
    role: button
    name: "Delete"
  nth: 1
```

## “Demo Anything” Acceptance Matrix

The `examples/` suite is the living acceptance test. It intentionally covers different UI patterns:

- **Forms and validation**: `examples/form-wizard*.demo.yaml`
- **Auth flows (OTP)**: `examples/auth-otp.demo.yaml`
- **Dialogs, tooltips, overlays**: `examples/modals-popovers*.demo.yaml`
- **SPA navigation**: `examples/spa-router*.demo.yaml`
- **Infinite scroll / long pages**: `examples/infinite-scroll*.demo.yaml`
- **Dense tables / dashboards**: `examples/dashboard-table*.demo.yaml`
- **Charts + hover tooltips**: `examples/chart-tooltips.demo.yaml`
- **Virtualized tables**: `examples/virtual-table.demo.yaml`
- **Controls matrix (checkbox/select/upload/drag)**: `examples/controls-lab*.demo.yaml`
- **Selector stress (nth disambiguation)**: `examples/selector-stress.demo.yaml`

Run:

```bash
pnpm examples:validate
pnpm examples:capture
```

`examples:capture` is the strongest “works in reality” signal because it launches each demo app, drives the browser, records video, and writes Playwright `trace.zip`.

## How To Demo A New App (Playbook)

1. Add stable locators:
   - Prefer `data-testid` and accessible roles/labels.
2. Stabilize the app for demo mode:
   - Seed deterministic data.
   - Disable non-essential background polling if it causes UI jitter.
3. Write a `.demo.yaml`:
   - Keep chapters small and narrative-driven.
   - Prefer `target` over CSS.
4. Prove it in the example suite:
   - `demo-machine validate` (fast feedback)
   - `demo-machine capture` (real browser)
5. Iterate with artifacts:
   - On failure, use `trace.zip` plus `failure.png`/`failure.html`/`failure.json`.
