# Video Evaluator Migration Beads Plan

`demo-machine` should use `@45ck/video-evaluator` for reusable video analysis
and keep demo-specific capture, playback, and product quality gates local.

## Beads Status

Beads was initialized in this repo on 2026-04-29 with prefix `demo-machine`.
Existing `.beads/*.md` planning notes were preserved.

Primary issue graph:

| ID | Priority | Title |
| --- | --- | --- |
| `demo-machine-6n8` | P0 | Adopt video-evaluator for shared demo analysis |
| `demo-machine-8w7` | P0 | Add video-evaluator runtime dependency and adapter boundary |
| `demo-machine-lmr` | P0 | Generate analyzer artifacts for completed demo runs |
| `demo-machine-cu4` | P1 | Integrate analyzer status into quality runner |
| `demo-machine-i2h` | P1 | Preserve golden-frame and visual-diff command contracts |
| `demo-machine-bs4` | P1 | Replace MCP review-demo prompt with evaluator package-review-prompt |
| `demo-machine-lzc` | P1 | Document demo analyzer workflow and quality gate |
| `demo-machine-9l1` | P2 | Retire duplicated generic visual analyzer code after parity |

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

## Cleanup Rule

Do not delete demo-machine quality or visual code until parity is proven on an
example-suite run. Generic video facts and visual primitives can move to
`video-evaluator`; demo-specific policy remains here and continues to feed the
top-level `quality.json`.
