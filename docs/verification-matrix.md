# Verification Matrix

Use this doc to understand what the current checks prove. Use the [Verification Roadmap](verification-roadmap.md) for planned work, [Examples Assurance](examples-assurance-plan.md) for example-suite organization, and the [Documentation Index](README.md) for the full docs map.

`demo-machine` now carries two explicit verification sources:

- `docs/verification-inventory.json`: the supported product surface that needs proof
- `examples/manifest.json`: the example suites that provide that proof, plus release-tier intent

Use `pnpm quality:verify` to compare the two and print the current proof gaps.

The expanded verification strategy lives in
[`docs/verification-roadmap.md`](verification-roadmap.md). The project roadmap
in `ROADMAP.md` explains product direction, while the verification roadmap
explains how inventory proof grows into broader rendered-demo assurance.

Inventory coverage is necessary, but it is not sufficient for rendered-demo
excellence. A suite can cover every supported action, target strategy, preStep,
pattern tag, and quality signal while still producing video-level defects such
as blank frames, frozen playback, clipped targets, cursor occlusion, subtitle
legibility problems, exposed sensitive content, or browser-specific drift.

## Verification Layers

- Schema and unit: parser defaults, validation, timing math, selector formatting, renderer argument construction
- Integration: playback orchestration, capture lifecycle, event logging, narration/audio assembly
- Example-backed browser proof: real example specs under `examples/`
- Visual review: gallery GIFs and frame captures under `assets/demo-gallery/`
- Failure diagnostics: trace, screenshot, HTML snapshot, and step context when capture fails
- Analyzer review: optional video-evaluator artifacts generated from completed runs
- Visual regression: golden-frame baselines and visual-diff reports for rendered demos

## Release Tiers

- `pr`: smaller set of suites that should stay fast and representative
- `nightly`: broader pattern coverage, variants, and polish-heavy flows

The current suite-to-tier mapping lives in `examples/manifest.json`.

## Visual Review Rubric

- Target is visible and framed before interaction
- Cursor motion is readable and does not obscure critical UI
- Overlays, subtitles, and callouts remain legible
- Async states look intentional rather than half-rendered
- Redacted content is fully obscured
- Output avoids jump cuts, clipping, and accidental layout jitter

## Current Enforcement

- `pnpm validate` includes `pnpm quality:verify:strict`; no CI workflow is assumed.
- `pnpm local-ready` is the fast local handoff gate and runs `pnpm build`, `pnpm validate`, and manifest-backed example-spec validation.
- `pnpm release-ready:fast` adds release gates for external tooling, gallery consistency, and package dry-run readiness without rendering smoke videos.
- `pnpm release-ready` is the heavier release gate: tool/gallery checks, build, validate, PR-tier example validation, PR-tier capture/render smoke, video assurance, and package dry-run readiness.
- `pnpm examples:validate:pr`, `pnpm examples:capture:pr`, and `pnpm examples:smoke:pr` target canonical PR-tier showcase suites via `examples/manifest.json`.
- `demo-machine run` executes post-render quality checks after rendering. It writes `quality.json`; screenshot-backed visual checks use collected step screenshots, assert before/after pairs, cursor positions, and chapter title screenshots.
- `demo-machine analyze <output-dir>` generates analyzer artifacts for an existing run without recapture or rerender. It writes `review-bundle.json`, `review-prompt.md`, `video.shots.json`, `segment.evidence.json`, `layout-safety.report.json`, and `segment-storyboard/` files next to the run output.
- When analyzer artifacts are present beside `output.mp4`, the quality runner reads `layout-safety.report.json`, `segment.evidence.json`, and `review-bundle.json` and records analyzer findings as normal checks in `quality.json`. Missing analyzer artifacts remain optional and do not fail the gate by themselves.
- `pnpm examples:capture` verifies raw capture artifacts and `verification.json`.
- `pnpm release:gates:tools` verifies ffmpeg, ffprobe, and Playwright Chromium availability; `pnpm release:gates:gallery` verifies gallery-reviewed manifest suites have generated gallery assets; `pnpm release:gates:showcase` verifies the README main MP4/poster links, the manifest-backed long-demo showcase, and a curated gallery breadth of at least 10 high-quality entries.
- `pnpm golden-frames` extracts five baseline PNGs per rendered demo from `output/example-suite` by default. `pnpm golden-frames:compare` compares current frames against existing baselines, and `pnpm golden-frames:update` overwrites accepted baselines.
- `pnpm visual-diff` compares current rendered frames with `baselines/golden-frames` and writes `output/visual-diff-report.json`; `pnpm visual-diff:update` updates baselines after intentional visual changes.
- All known inventory proof gaps have been closed; `quality:verify:strict` enforces zero gaps on every `pnpm validate` run. This is inventory coverage, not a claim that every rendered visual baseline is refreshed on every local validation run.

## Beyond Inventory

Rendered-demo assurance is tracked in
[`docs/verification-roadmap.md`](verification-roadmap.md). Analyzer artifacts,
golden-frame extraction, and visual-diff comparison exist, but baseline refresh
is intentionally a human-approved operation rather than part of `pnpm
local-ready`. Items such as flake detection, chaos mode, performance budgets,
redaction scans across generated artifacts, docs freshness, and
CLI/library/MCP parity should be read as roadmap work unless this matrix or the
relevant script explicitly says they are part of `pnpm validate`, `pnpm
local-ready`, or another documented release gate.

## Known Gaps

None in the current inventory proof set. All 21 actions, 3 preSteps, and 8
target strategies have example proof as of 0.3.0. This does not mean all planned
rendered-video, security, flake, chaos, performance, docs, or parity checks are
implemented or release-gated.
