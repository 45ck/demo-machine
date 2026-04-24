# Verification Matrix

`demo-machine` now carries two explicit verification sources:

- `docs/verification-inventory.json`: the supported product surface that needs proof
- `examples/manifest.json`: the example suites that provide that proof, plus release-tier intent

Use `pnpm quality:verify` to compare the two and print the current proof gaps.

## Verification Layers

- Schema and unit: parser defaults, validation, timing math, selector formatting, renderer argument construction
- Integration: playback orchestration, capture lifecycle, event logging, narration/audio assembly
- Example-backed browser proof: real example specs under `examples/`
- Visual review: gallery GIFs and frame captures under `assets/demo-gallery/`
- Failure diagnostics: trace, screenshot, HTML snapshot, and step context when capture fails

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

- `pnpm validate` includes `pnpm quality:verify:strict`
- Local release readiness should also run `pnpm examples:validate -- --no-build`
- All known proof gaps have been closed; `quality:verify:strict` enforces zero gaps on every `pnpm validate` run

## Known Gaps

None. All 18 actions, 3 preSteps, and 8 target strategies have example proof as of 0.3.0.
