# Video Evaluator Migration Beads Plan

`demo-machine` should use `@45ck/video-evaluator` for reusable video analysis
and keep demo-specific capture, playback, and product quality gates local.

## Beads Status

Beads was initialized in this repo on 2026-04-29 with prefix `demo-machine`.
Existing `.beads/*.md` planning notes were preserved.

Primary issue graph:

| ID                 | Priority | Title                                                               |
| ------------------ | -------- | ------------------------------------------------------------------- |
| `demo-machine-6n8` | P0       | Adopt video-evaluator for shared demo analysis                      |
| `demo-machine-8w7` | P0       | Add video-evaluator runtime dependency and adapter boundary         |
| `demo-machine-lmr` | P0       | Generate analyzer artifacts for completed demo runs                 |
| `demo-machine-cu4` | P1       | Integrate analyzer status into quality runner                       |
| `demo-machine-i2h` | P1       | Preserve golden-frame and visual-diff command contracts             |
| `demo-machine-bs4` | P1       | Replace MCP review-demo prompt with evaluator package-review-prompt |
| `demo-machine-lzc` | P1       | Document demo analyzer workflow and quality gate                    |
| `demo-machine-9l1` | P2       | Retire duplicated generic visual analyzer code after parity         |

Run:

```bash
npm_config_script_shell=/bin/bash npx --yes @beads/bd ready
npm_config_script_shell=/bin/bash npx --yes @beads/bd graph
```

## Adapter Path

Add one adapter, for example `src/quality/video-evaluator-adapter.ts`, that
imports from `@45ck/video-evaluator`.

The adapter should generate analyzer artifacts for a completed run without
rerendering:

- `review-bundle.json`
- `video.shots.json`
- `segment-storyboard/*`
- `segment.evidence.json`
- `layout-safety.report.json`
- `review-prompt.md`

Keep these compatibility surfaces stable:

- `pnpm local-ready`
- `pnpm quality:verify`
- `pnpm quality:verify:strict`
- `pnpm golden-frames`
- `pnpm golden-frames:compare`
- `pnpm golden-frames:update`
- `pnpm visual-diff`
- `pnpm visual-diff:update`
- MCP prompt `review-demo`

## Implemented First Slice

The boundary lives in `src/quality/video-evaluator-adapter.ts` and exports
`analyzeDemoRun()`. The adapter dynamically loads an installed
`@45ck/video-evaluator` package first, then falls back to the local sibling
`../video-evaluator/dist/index.js` during migration. It checks that the expected
exports exist and writes analyzer artifacts into an already-completed demo
output directory. It does not rerender, recapture, or replace demo-machine's
existing `quality.json` gate.

CLI entry point:

```bash
demo-machine analyze output/my-demo/20260429-120000-000
demo-machine --output ./output analyze --latest
```

Optional flags:

- `--spec <path>` includes the original spec path in `review-prompt.md`.
- `--video <path>` analyzes a specific video when no run directory is available.
- `--layout <path>` passes layout annotations to layout-safety review.
- `--no-ocr` skips OCR and transition extraction when local OCR dependencies are
  not ready.

Current artifact contract:

- `review-bundle.json`
- `video.shots.json`
- `segment-storyboard/storyboard.manifest.json`
- `segment-storyboard/storyboard.ocr.json` unless `--no-ocr`
- `segment-storyboard/storyboard.transitions.json` unless `--no-ocr`
- `segment.evidence.json`
- `layout-safety.report.json`
- `demo-capture-evidence.json` when screenshot or event evidence exists
- `review-prompt.md`

Implemented dependent slice:

- `demo-machine-cu4`: `runQualityGate()` now consumes
  `layout-safety.report.json`, `segment.evidence.json`, and
  `review-bundle.json` when they are present beside the rendered video. Analyzer
  findings are emitted as normal post-render check results inside the existing
  `quality.json` shape; missing analyzer artifacts remain optional.

Implemented follow-up slices:

- `demo-machine-bs4`: MCP `review-demo` now routes reviewers toward the
  evaluator-generated `review-prompt.md` instead of relying only on local
  heuristics.
- `demo-machine-lzc`: README, CLI docs, MCP docs, and the verification matrix
  document the analyzer workflow and quality-gate behavior.

Current dependency state:

- `package.json` depends on `@45ck/video-evaluator` from
  `github:45ck/video-evaluator`.
- `pnpm-lock.yaml` pins the dependency to the pushed evaluator commit used by
  this repo.
- The adapter still has a local sibling fallback for active development, but
  the package dependency is the primary runtime path.

## Cleanup Rule

Do not delete demo-machine quality or visual code until parity is proven on an
example-suite run. Generic video facts and visual primitives can move to
`video-evaluator`; demo-specific policy remains here and continues to feed the
top-level `quality.json`.
