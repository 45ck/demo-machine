# Verification Roadmap

This roadmap turns the expanded review into a durable verification and
validation strategy for `demo-machine`. It is a planning document, not a claim
that every listed check is already enforced.

Status labels:

- **Current**: enforced by the documented local gates or already documented as
  the active workflow.
- **In progress/implemented**: visible in repository code or scripts, but not
  part of the default release gate unless the item explicitly says so.
- **Planned**: not yet implemented, or implemented only partially enough that it
  should not be treated as project assurance.

## Verification Model

`demo-machine` needs proof at three levels:

- **Inventory coverage** proves every supported action, target strategy,
  preStep, pattern tag, and quality signal has at least one example or manifest
  entry.
- **Artifact contracts** prove every run emits durable, parseable evidence that
  humans and tools can inspect after capture, render, and failure.
- **Rendered-demo excellence** proves the final video is correct, readable,
  polished, redacted, stable, and representative across the supported surfaces.

Inventory coverage is necessary because it prevents unsupported behavior from
silently entering the product. It is not sufficient because a demo can satisfy
the inventory while still producing a bad video: blank frames, clipped targets,
bad cursor timing, exposed sensitive text, misleading narration, broken assets, or
browser-specific drift.

## Current Baseline

- **Current**: `pnpm validate` runs linting, formatting, spelling, typecheck,
  tests, dependency checks, and `pnpm quality:verify:strict`.
- **Current**: `pnpm local-ready` runs `pnpm build`, `pnpm validate`, and
  manifest-backed example validation.
- **Current**: `docs/verification-inventory.json` plus
  `examples/manifest.json` define the inventory-to-proof contract.
- **Current**: `demo-machine run` writes `quality.json` after rendering.
- **Current**: post-render quality checks cover video probing, resolution,
  audio/video duration parity, codec compliance, file size, file size trend,
  narration ordering, frame rate, intro/outro presence, duration anomalies, and
  screenshot-backed visual signals when screenshot evidence exists.
- **Current**: `pnpm examples:capture` validates capture artifacts and
  `verification.json`.
- **Current**: redaction selectors and secret patterns are part of the spec
  surface and have unit coverage.
- **Current**: the MCP server surface is documented and has tests for the known
  tools, resources, and prompts.
- **In progress/implemented**: `pnpm video:assure` scans rendered output
  for blank frames, frozen frame runs, and large visual jumps.
- **In progress/implemented**: `pnpm visual-diff` compares extracted
  frames to golden-frame baselines.
- **In progress/implemented**: standalone flake, chaos, performance, and
  cross-browser scripts exist under `scripts/`.

## Roadmap Areas

### Artifact Contracts

Goal: every run should leave enough structured evidence to reproduce, debug, and
review the outcome without rerunning the demo immediately.

- **Current**: capture and render outputs include structured artifacts such as
  `events.json`, `verification.json`, `quality.json`, screenshots, traces, and
  `output/latest.json` when applicable.
- **Current**: `quality:verify:strict` checks inventory and manifest consistency.
- **Planned**: publish a versioned artifact schema for `events.json`,
  `verification.json`, `quality.json`, assurance reports, and gallery manifests.
- **Planned**: add contract tests that load historical sample artifacts and fail
  on accidental field removal, status changes, path instability, or malformed
  diagnostics.
- **Planned**: require every failure path to include a stable error code,
  human-readable message, failing step identity, relevant artifact paths, and
  redaction status.

### Functional Correctness

Goal: specs should execute the intended browser behavior, not merely pass schema
validation.

- **Current**: schema and unit tests cover parser defaults, validation rules,
  target formatting, timing math, quality checks, redaction helpers, MCP tools,
  and playback behavior.
- **Current**: example proof covers inventory actions, preSteps, target
  strategies, pattern tags, and quality signals.
- **Current**: capture artifact validation exercises real app fixtures through
  browser automation.
- **Planned**: add action-level oracle checks for state changes after each
  interaction, including navigation, form input, selection, uploads, drag/drop,
  keyboard input, and waits.
- **Planned**: add negative fixture coverage for ambiguous targets, missing
  elements, stale elements, failed assertions, unsupported controls, and
  timeouts.
- **Planned**: require proof examples for every new public spec field before
  release.

### Visual Polish

Goal: final videos should be readable, intentional, and free of visual defects.

- **Current**: post-render quality checks can consume collected screenshots for
  step deltas, assert zero-effect checks, cursor positions, phantom overlays,
  and chapter title frames.
- **Current**: gallery assets and the visual review rubric provide a human review
  path.
- **In progress/implemented**: video assurance can inspect rendered
  videos for blank frames, frozen runs, and large jumps.
- **In progress/implemented**: visual diff tooling can compare current
  frames against golden-frame baselines.
- **Planned**: promote rendered-video assurance into an explicit release tier
  once output availability and dependencies are reliable.
- **Planned**: add checks for target framing, text clipping, cursor occlusion,
  overlay legibility, subtitle safety zones, and layout jitter.
- **Planned**: track visual failures with frame samples and diff artifacts that
  can be reviewed without opening the full video.

### Release Gates

Goal: local release commands should fail on defects that users would experience
in installed demos.

- **Current**: `pnpm validate` is the strict inventory and code-quality gate.
- **Current**: `pnpm local-ready` is the documented local handoff and publish
  gate.
- **Current**: no CI workflow is assumed.
- **Planned**: define release tiers for fast PR checks, nightly/broad checks,
  rendered-video checks, and prepublish checks.
- **Planned**: require gate output to identify which assurance layers ran,
  skipped, or failed.
- **Planned**: make release-blocking skips explicit. A missing dependency,
  missing baseline, absent rendered output, or unavailable browser should not be
  silently treated as a pass.

### Flake, Chaos, And Performance

Goal: users should not receive demos that pass once but fail under ordinary
timing, browser, or app-state variation.

- **In progress/implemented**: the flaky detector can run specs multiple
  times and compare event structure and timing variance.
- **In progress/implemented**: chaos mode mutates specs to verify that
  invalid selectors, bad URLs, failed assertions, bad timeouts, and reordered or
  removed steps are detected.
- **In progress/implemented**: the capture performance gate can compare
  current timings against a baseline.
- **In progress/implemented**: the cross-browser matrix can compare event
  logs across Playwright browsers where installed.
- **Planned**: connect these scripts to manifest release tiers and write reports
  with stable schemas.
- **Planned**: add reproducible seeds for chaos mutations and flake runs so a
  failure can be rerun exactly.
- **Planned**: add budget policies for capture time, render time, output size,
  startup time, and per-action latency.

### Security And Redaction

Goal: sensitive content should not leak through video, screenshots, logs,
reports, traces, docs, or examples.

- **Current**: specs support redaction selectors and secret patterns.
- **Current**: playback applies redaction CSS and scans for configured secret
  patterns.
- **Current**: unit tests cover selector masking and secret scanning.
- **Current**: manifest signals include redaction-oriented proof coverage.
- **Planned**: scan all generated artifacts for configured secrets, including
  screenshots, traces, `events.json`, `verification.json`, `quality.json`,
  reports, gallery outputs, and docs-generated assets.
- **Planned**: add rendered-frame redaction checks that confirm redacted regions
  remain obscured across the full video, not only during capture.
- **Planned**: define safe example-data rules so demo fixtures never require
  real customer, token, credential, or account data.

### Docs And Examples

Goal: examples should be both user education and executable assurance.

- **Current**: examples are manifest-backed and separated into showcase, proof,
  variant, and assurance fixtures.
- **Current**: docs explain the example layout, CLI usage, spec format, MCP
  integration, gallery review, and current verification matrix.
- **Current**: `demo-machine examples list` exposes release tier, visual
  baseline, pattern tags, and quality signals.
- **Planned**: require every docs example to point to an executable spec or state
  that it is illustrative only.
- **Planned**: add a docs freshness check that validates referenced example paths,
  scripts, generated artifacts, and command names.
- **Planned**: publish a reviewer checklist for when gallery baselines should be
  refreshed.

### MCP And Library Parity

Goal: CLI, library, and MCP users should receive comparable validation,
artifacts, and failure diagnostics.

- **Current**: the MCP server exposes documented tools, resources, and prompts,
  with tests around the registered surface.
- **Current**: the CLI and pipeline expose structured output paths and quality
  status.
- **Planned**: create a parity inventory that maps each supported CLI workflow to
  the library API and MCP surface.
- **Planned**: require equivalent artifact contracts for CLI, library, and MCP
  runs.
- **Planned**: add parity tests for validation results, run summaries, error
  shapes, output path behavior, and redaction handling.
- **Planned**: document intentional gaps where a workflow is CLI-only or
  MCP-only.

## Prioritized Implementation Backlog

Priority is based on user-visible risk, defect severity, release-gate leverage,
reproducibility, and breadth. It intentionally excludes time or effort.

1. **Promote rendered-video assurance to a release gate.** A demo can pass
   inventory and still ship blank, frozen, or visually broken video. Wire
   `pnpm video:assure` into a defined tier after rendered outputs exist, and
   make skipped analysis explicit.
2. **Version the artifact contracts.** Stabilize `events.json`,
   `verification.json`, `quality.json`, assurance reports, gallery manifests,
   and failure reports so downstream tools and reviewers can rely on them.
3. **Add artifact-wide redaction and secret scans.** Extend redaction assurance
   beyond the page to every generated artifact and report.
4. **Make failure diagnostics contract-tested.** Every failed run should expose
   the failing step, stable reason, screenshots or traces when available, and
   enough context to reproduce without guessing.
5. **Gate visual baselines for representative rendered demos.** Promote golden
   frame or video diff checks for a small release-tier set before broadening to
   nightly coverage.
6. **Add action-level functional oracles.** Verify post-action browser state for
   the highest-risk interactions, especially forms, selects, uploads, drag/drop,
   navigation, waits, and assertions.
7. **Promote flake detection for release-tier examples.** Use repeated runs to
   catch timing variance, nondeterministic event sequences, and intermittent
   capture failures before release.
8. **Promote chaos mode as a detection-strength check.** Require selected
   mutants to be detected so broken specs do not appear successful.
9. **Define performance budgets and baselines.** Track capture, render, total
   runtime, output size, and per-action latency with reproducible reports.
10. **Add browser and platform parity gates.** Start with event-structure parity
    across supported Playwright browsers, then add rendered-video comparisons
    where stable.
11. **Create CLI/library/MCP parity inventory and tests.** Ensure the same user
    workflow has equivalent validation, artifacts, errors, and redaction behavior
    across public entry points.
12. **Add docs freshness checks.** Validate docs commands, linked specs, example
    paths, generated gallery references, and release-gate descriptions.
13. **Formalize visual polish rubrics as checks.** Convert human review items
    such as framing, cursor occlusion, subtitle legibility, clipped text, and
    jitter into measurable signals where practical.
14. **Track assurance history.** Store recent gate summaries so trends in flakes,
    performance, file size, visual diffs, and quality warnings are visible.
15. **Document skip policy.** Distinguish pass, fail, warning, not applicable,
    and skipped states across every assurance report.
