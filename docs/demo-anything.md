# Demo Anything

This repo’s goal is to generate **high-polish, repeatable product demos** from a spec, across many kinds of web applications.

Use this doc for authoring guidance and example selection. Use the [Spec Reference](spec-reference.md) for exact fields, the [CLI Reference](cli-reference.md) for commands, and the [Documentation Index](README.md) for the full map.

## Design Principles

1. **Target intent, not implementation**
   - Prefer `target` locators (role/label/testId/text) over brittle CSS.
2. **Be deterministic**
   - Specs should drive stable demo data, stable URLs, and stable UI states.
3. **Make the audience track the story**
   - Narrated focus should use cursor motion plus zoom by default. Reserve persistent highlight rings for rare cases where zoom alone cannot identify the target; the real click pulse should provide action feedback.
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

## Examples Layout And Discovery

The organized `examples/` tree separates demo purposes:

- `examples/showcase/`: polished product demos used by docs and gallery generation.
- `examples/proof/actions/`: focused specs for individual playback primitives.
- `examples/proof/variants/`: redaction and narration-sync coverage variants.
- `examples/assurance/long-demo/`: a longer end-to-end flow for full-video QA.

`examples/manifest.json` is the source of truth. Use `demo-machine examples list` to browse showcase and assurance examples, `demo-machine examples list --type proof` for small action fixtures, and `demo-machine examples show <slug>` to print the canonical spec, variants, quality signals, and matching `run` and `validate` commands.

The public showcase surface has two layers:

- `assets/demo-gallery/assurance-long-demo.mp4` is the main narrated MP4 with zoom-focused camera movement.
- `assets/demo-gallery/manifest.json` keeps the broader curated gallery at 10+ high-quality entries, each with a GIF preview, five frame captures, and a duration.

`pnpm release:gates:showcase` protects those links and counts so the README and gallery do not silently drift.

## “Demo Anything” Acceptance Matrix

The `examples/` suite is the living acceptance test. It intentionally covers different UI patterns:

- **Forms and validation**: `examples/showcase/form-wizard.demo.yaml`
- **Auth flows (OTP)**: `examples/showcase/auth-otp.demo.yaml`
- **Dialogs, tooltips, overlays**: `examples/showcase/modals-popovers.demo.yaml`
- **SPA navigation**: `examples/showcase/spa-router.demo.yaml`
- **Long realistic flows**: `examples/assurance/long-demo/long-demo.demo.yaml`
- **Dense tables / dashboards**: `examples/showcase/dashboard-table.demo.yaml`
- **Charts + hover tooltips**: `examples/showcase/chart-tooltips.demo.yaml`
- **Virtualized tables**: `examples/showcase/virtual-table.demo.yaml`
- **Controls matrix (checkbox/select/upload/drag)**: `examples/showcase/controls-lab.demo.yaml`
- **Selector stress (nth disambiguation)**: `examples/showcase/selector-stress.demo.yaml`
- **Agent-created fresh project demos**: `pnpm qa:meta-prompt` scaffolds a complex app plus a Demo Machine Codex skill; `pnpm qa:meta-prompt:run` asks Codex CLI to create narrated MP4s, cover the action/component matrix, self-evaluate, and hand off demos from that clean workspace.

Run:

```bash
demo-machine examples list --tag forms
demo-machine examples show assurance-long-demo
pnpm quality:verify
pnpm examples:validate
pnpm examples:capture
node scripts/examples-suite.mjs --mode run --filter assurance-long-demo
pnpm video:assure -- --filter assurance-long-demo
pnpm qa:meta-prompt
```

Use `demo-machine examples list` to find a nearby product pattern before writing a new spec. `examples:validate` loads every manifest-backed canonical spec and variant. `examples:capture` is the strongest raw-capture signal because it launches each demo app, drives the browser, records video, writes screenshot evidence when available, and writes Playwright `trace.zip`. Rendered quality evidence is produced by `demo-machine run` as `quality.json`; after rendered MP4s exist under `output/example-suite/`, `video:assure` samples them for blank frames, frozen spans, and large visual jumps. The `assurance-long-demo` filter targets the long realistic flow for full-demo QA.

## Meta Prompt QA

Meta prompt QA proves a different end-to-end path: an agent starts in an empty project, uses the local Demo Machine skill, writes demos for a complex app, runs Demo Machine with narration, self-evaluates the artifacts, and then asks for human review.

```bash
pnpm qa:meta-prompt
pnpm qa:meta-prompt:run
```

The first command is deterministic and creates `output/meta-prompt-qa/workspace/` with a fixture app, `.codex/skills/demo-machine/SKILL.md`, and `META_PROMPT.md`. The second command invokes `codex exec`, so it requires a working Codex CLI login and may vary by model. Generated demos are collected into `output/meta-prompt-qa/review.html` with links to MP4s, specs, quality files, action coverage, audio/subtitle status, and `SELF_EVALUATION.md`. The review report marks the run failed if MP4s are silent, subtitles are missing, fewer than three demos exist, or the required action surface is incomplete.

For Claude Code-style usage, the repository also carries `.claude/skills/` entries. The same quality expectation applies in either harness: the agent should run the spec, inspect the rendered MP4 and artifacts, then iterate until narration, target zoom, cursor motion, click feedback, and zoom-out timing feel intentional.

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
   - Use the run summary to open the resolved output directory.
   - On failure, use `trace.zip` plus `failure.png`/`failure.html`/`failure.json`.
   - Let default output create a new `./output/<spec-slug>/<run-id>` folder for repeat attempts; `./output/latest.json` points to the newest automatic run.
   - Use `--output` plus `--overwrite` only for a deliberate fixed handoff path.
