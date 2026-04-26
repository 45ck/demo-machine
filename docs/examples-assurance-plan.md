# Examples Assurance

`examples/` separates human-facing demos from proof and assurance fixtures.

Use this doc for suite organization and verification contracts. Use [Demo Anything](demo-anything.md) when authoring a new demo, and use the [Verification Matrix](verification-matrix.md) when you need to know which checks are release-gated.

## Folders

- `examples/showcase/`: polished demos used by docs, gallery generation, and normal example discovery.
- `examples/proof/actions/`: small action-level specs used to prove individual playback primitives.
- `examples/proof/variants/`: coverage variants such as auto-sync and redaction specs.
- `examples/assurance/long-demo/`: a long realistic app and spec for full-video QA.
- `examples/<app>/`: deterministic local app fixtures used by showcase and proof specs.

Only `manifest.json` and the standalone `meta-demo.demo.yaml` remain at the `examples/` root.

## Layout Rules

Root-level throwaway specs should stay out of the active suite. Coverage belongs in the controls lab, async/virtualized showcase specs, assurance specs, or proof-level action specs, and every curated entry should be represented in `examples/manifest.json`.

## Tooling Contract

The example manifest is the source of truth. Scripts should read `examples/manifest.json` instead of assuming specs live directly under `examples/`.

Use:

- `pnpm examples:validate` for manifest-backed spec validation.
- `demo-machine examples list` to show showcase and assurance entries by default.
- `demo-machine examples list --type proof` to show action-level fixtures.
- `demo-machine examples list --type all` to show every manifest entry.
- `demo-machine examples show <slug>` to inspect one entry, including canonical spec, variants, tags, quality signals, and runnable `run` and `validate` commands.
- `pnpm quality:verify:strict` for inventory coverage.
- `pnpm video:assure` after rendered example outputs exist.

## Validation Workflow

Fast spec validation:

```bash
pnpm examples:validate -- --no-build
```

Raw browser capture validation:

```bash
pnpm examples:capture -- --filter controls-lab
```

`examples:capture` writes each capture under `output/example-suite/<slug>/` and verifies required artifacts including `video.webm`, `events.json`, `metadata.json`, `environment.json`, `verification.json`, and `trace.zip`.

## Video Assurance

Rendered-video assurance runs after MP4 outputs exist:

```bash
node scripts/examples-suite.mjs --mode run --filter controls-lab
pnpm video:assure -- --filter controls-lab
```

`pnpm video:assure` scans `output/example-suite/` by default, extracts diagnostic frames into `output/video-assurance/`, and writes `output/video-assurance-report.json`. It flags blank frames, frozen frame spans, and large visual jumps.

## Long-Demo QA

Use the assurance long demo when validating full-flow behavior rather than a single action or gallery demo:

```bash
demo-machine examples show assurance-long-demo
pnpm examples:validate -- --filter assurance-long-demo --no-build
pnpm examples:capture -- --filter assurance-long-demo
node scripts/examples-suite.mjs --mode run --filter assurance-long-demo
pnpm video:assure -- --filter assurance-long-demo
```

The manifest entry points to `examples/assurance/long-demo/long-demo.demo.yaml`. Keep this spec out of the gallery path; it exists to exercise long narration timing, scrolling, overlays, charts, tables, and multi-step state transitions.
