# Roadmap

demo-machine is a local-first demo automation toolkit. Its job is to turn a versioned spec into a repeatable browser capture, render a polished product video, and leave enough evidence behind that the run can be reviewed, fixed, and trusted.

## Product Direction

The project is optimized for teams that need demos to be repeatable instead of manually re-recorded:

- Product and engineering teams can keep demo journeys next to application code.
- Release work can regenerate videos from the same source of truth as tests.
- AI assistants can help author, review, and repair specs through the MCP server.
- Local validation is the quality gate while CI is intentionally out of scope for now.

## Current Baseline

Version `0.3.0` has the core platform in place:

- YAML, JSON, JSON5, and TOML spec loading with schema validation.
- Browser playback through Playwright with cursor motion, typing, pacing, assertions, screenshots, redaction, and pre-capture setup.
- Capture artifacts: `video.webm`, `events.json`, `metadata.json`, `environment.json`, `verification.json`, screenshot evidence, and `trace.zip`.
- Rendered output: `output.mp4`, narration, subtitles, and `quality.json`.
- Safe default output directories under `output/<spec-slug>/<run-id>` plus `output/latest.json`.
- Explicit output directories protected from accidental artifact overwrite unless `--overwrite` is used.
- MCP tools, resources, and prompts for spec generation, validation, capture, render, narration, review, and repair.
- A verification inventory and example manifest that prove all supported actions, preSteps, target strategies, pattern tags, and quality signals.
- `pnpm validate` and `pnpm local-ready` as the documented local quality gates.

## Near-Term Priorities

1. **Demo authoring ergonomics**
   - Improve generated starter specs so they choose better structured targets by default.
   - Add clearer failure messages for ambiguous targets and selector drift.
   - Expand example catalog metadata so users can find a similar flow faster.

2. **Review and repair loop**
   - Make `review-demo` and `heal-spec` summarize the latest run more directly from `output/latest.json`.
   - Add a stable run summary artifact if the CLI and MCP result shape needs to be consumed outside the process.
   - Keep failure diagnostics actionable: trace, screenshot, HTML, failed step, and suggested fix path.

3. **Visual polish**
   - Keep improving cursor framing, callout timing, subtitles, overlays, and chapter transitions.
   - Add more gallery examples for dense enterprise screens and SaaS admin workflows.
   - Make visual review outputs easier to scan in the generated HTML gallery.

4. **Verification depth**
   - Keep `docs/verification-inventory.json` and `examples/manifest.json` in lockstep with new feature work.
   - Add targeted regression examples whenever a new action, target strategy, visual signal, or app pattern is introduced.
   - Preserve the local-first quality gate: build, lint, format, spell, typecheck, tests, dependency checks, and inventory verification.

## Later

- A CI/release pipeline can be reintroduced when the local workflow is stable enough to automate without slowing iteration.
- More render backends may be considered if they improve quality or performance without weakening artifact compatibility.
- Multi-language narration and localization workflows can become first-class once the review loop is solid.

## Non-Goals For Now

- No GitHub Actions or remote CI dependency.
- No cloud service requirement for the default path.
- No replacement for application E2E tests; demo specs are presentation and verification artifacts, not the full product test suite.
- No timestamped artifact filenames inside a run directory. Artifact names stay stable; run directories provide isolation.
