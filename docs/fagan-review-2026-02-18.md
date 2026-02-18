# Fagan Inspection: Demo Anything Hardening

Date: 2026-02-18

## Scope

- Spec schema extensions for broader UI coverage (`check`, `uncheck`, `select`, `upload`, `dragAndDrop`, `back`, `forward`, `nth`)
- Playback robustness and polish (locator targeting + “select” overlays)
- Failure artifacts on capture errors (HTML + screenshot + step context)
- Example suite expansion to exercise new primitives (`examples/controls-lab*`)

## Roles

- Author: demo-machine engineering
- Reviewer(s): demo-machine maintainers
- Moderator: repo owner
- Scribe: reviewer on duty

## Entry Criteria

- `pnpm test` passes
- `pnpm examples:validate` passes
- `pnpm examples:capture` passes
- No new lint/typecheck failures; no new unused exports (Knip)

## Inspection Checklist

- Schema
  - Backward compatible defaults
  - Clear validation errors for missing required fields
  - New actions have minimal required fields and consistent options (`timeoutMs`, `delay`, `narration`, `nth`)
- Playback
  - Targeting prefers structured locators (role/label/testId/text) over CSS
  - Actions wait for readiness (attached/visible, scroll into view) where appropriate
  - Visual overlays are non-interactive (no pointer events) and survive navigation
- Capture/Debuggability
  - Failures produce actionable artifacts
  - Trace/video/events remain available even when playback fails mid-run
- Security/Abuse-resistance (demo context)
  - Upload paths resolve relative to the spec directory (not surprising CWD behavior)
  - Redaction/secret scanning still applied

## Findings (Defects / Risks)

### Medium

1. Library usage may miss `specDir`, making relative upload paths resolve against process CWD.
   - CLI passes `specPath`, but embedders calling playback/capture directly must supply `specDir`.
   - Impact: non-obvious failures in non-CLI integrations.
   - Recommendation: document `PlaybackOptions.specDir` and/or thread spec path through public APIs.
   - References: `src/cli/capture.ts`, `src/playback/types.ts`

### Low

1. Spotlight overlay styling is hard-coded.
   - Impact: teams may want to match branding colors or reduce intensity.
   - Recommendation: optional config later (non-blocking).
   - References: `src/playback/cursor.ts`, `src/playback/visuals.ts`

## Exit Criteria

- All entry criteria satisfied
- Medium findings tracked as follow-ups (or fixed in-scope if time allows)
- Docs updated to reflect new primitives and demo matrix
