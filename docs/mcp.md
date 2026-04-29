# MCP Integration

demo-machine ships an MCP server so AI assistants can help author, validate, run, review, and repair demos.

Use this doc when wiring demo-machine into an agent harness. For non-agent CLI usage, start with [Getting Started](../GETTING-STARTED.md) or the [CLI reference](cli-reference.md).

## Claude Desktop Setup

```json
{
  "mcpServers": {
    "demo-machine": {
      "command": "npx",
      "args": ["demo-machine-mcp"]
    }
  }
}
```

From a local checkout, build first and point your client at the local binary if needed:

```bash
pnpm build
node dist/mcp-server.js
```

## Tools

| Tool            | Description                                                                     |
| --------------- | ------------------------------------------------------------------------------- |
| `validate-spec` | Parse and validate a demo spec, returning chapter/step counts or errors.        |
| `capture-spec`  | Run browser capture only, returning structured artifact paths and event counts. |
| `run-pipeline`  | Run capture, render, optional narration, and quality checks.                    |
| `format-spec`   | Reserialize a spec as YAML or JSON.                                             |
| `list-voices`   | List configured TTS voices.                                                     |

Common tool inputs:

| Tool            | Important Inputs                                                                                        | Defaults / Notes                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `validate-spec` | `specPath`                                                                                              | Fast check before capture or render.                                                              |
| `capture-spec`  | `specPath`, `output`, `headless`, `narration`, `ttsProvider`, `selectApproach`, `overwrite`             | Capture-only path; `narration` defaults to `false` and only pre-synthesizes narration if enabled. |
| `run-pipeline`  | `specPath`, `output`, `headless`, `narration`, `renderer`, `ttsProvider`, `selectApproach`, `overwrite` | Full capture + render path; `narration` defaults to `true`.                                       |
| `format-spec`   | `specPath`, `format`                                                                                    | Use before committing generated specs.                                                            |
| `list-voices`   | none                                                                                                    | Reports configured voice entries for narration.                                                   |

For explicit `output` values, prefer a per-demo folder and use `overwrite` only for deliberate reruns. Automatic output paths are safer during exploration because demo-machine creates a run folder and updates `output/latest.json`.

## Resources

| Resource           | URI                               | Description                       |
| ------------------ | --------------------------------- | --------------------------------- |
| `basic-template`   | `demo-machine://templates/basic`  | Starter YAML spec template.       |
| `actions-docs`     | `demo-machine://docs/actions`     | Available step actions.           |
| `spec-format-docs` | `demo-machine://docs/spec-format` | Demo spec format reference.       |
| `ai-prompts-docs`  | `demo-machine://docs/ai-prompts`  | MCP prompt workflow documentation |

## Prompts

| Prompt             | Description                                                     |
| ------------------ | --------------------------------------------------------------- |
| `create-demo-spec` | Generate a spec YAML given an app URL and description.          |
| `debug-demo`       | Diagnose a failing spec from an error message.                  |
| `narrate-spec`     | Add narration text to every step in a spec.                     |
| `heal-spec`        | Repair a broken spec from failure artifacts.                    |
| `demo-from-url`    | Generate a spec by inspecting a live app URL.                   |
| `translate-spec`   | Translate narration to another language.                        |
| `spec-from-test`   | Convert a Playwright or Cypress test into a demo spec.          |
| `review-demo`      | Review a completed demo run, defaulting to `output/latest.json` |

`review-demo` prefers the analyzer-generated `review-prompt.md` artifact from
`demo-machine analyze`, which is built with `@45ck/video-evaluator`
`package-review-prompt`. If that artifact is missing, the prompt tells the agent
to run `demo-machine analyze <output-dir>` first and then falls back to a
limited raw-artifact review using `events.json`, `metadata.json`,
`subtitles.vtt`, and `verification.json`.

For evidence-backed MCP review, run the completed demo through the analyzer
before asking for `review-demo`:

```bash
demo-machine analyze <output-dir> --spec <spec.yaml>
```

The analyzer writes `review-prompt.md`, `review-bundle.json`,
`video.shots.json`, `segment.evidence.json`, `layout-safety.report.json`, and
`segment-storyboard/` artifacts beside the run. `review-demo` then embeds the
package review prompt and asks the agent to review against those artifacts
rather than relying only on raw logs. If local OCR dependencies are unavailable,
use `demo-machine analyze <output-dir> --no-ocr`; the review still has shot,
segment, layout, and bundle evidence, but OCR and transition evidence will be
missing.

## Agent Workflows

demo-machine works well in coding-agent harnesses because the demo spec, rendered output, quality files, and review artifacts all live in the workspace.

- **Claude Code-style skills**: this repo includes `.claude/skills/`, including a `demo-machine` skill for creating and reviewing narrated demos.
- **Codex-style skills**: `pnpm qa:meta-prompt` creates `output/meta-prompt-qa/workspace/.codex/skills/demo-machine/SKILL.md` plus a prompt that asks Codex to create, run, self-evaluate, and hand off demos.
- **Any MCP client**: configure the MCP server below, then ask the agent to validate the spec, run the pipeline, inspect artifacts, and iterate on the MP4.

For high-quality narrated demos, the agent should prefer cursor plus zoom focus by default: narration names the target, the cursor moves there, the camera zooms to the relevant UI, the real action lands while framed, and the view eases back out before the next step. The agent should inspect `events.json`, `narration-segments.json`, `quality.json`, and the MP4 before accepting the result.

Minimal agent loop:

1. Inspect the app and choose stable `target` locators, preferring `testId`, role, label, and text before CSS.
2. Draft or update the `.demo.yaml`.
3. Run `validate-spec`.
4. Run `run-pipeline` with narration enabled.
5. Run `demo-machine analyze <output-dir> --spec <spec.yaml>` when review artifacts are needed.
6. Review `output.mp4`, `events.json`, `narration-segments.json`, `quality.json`, and `review-prompt.md`.
7. Repair the spec and rerun until the MP4 is visually clean.

## Output Behavior

`capture-spec` and `run-pipeline` use the same output rules as the CLI:

- Omitted output creates a safe `output/<spec-slug>/<run-id>` directory.
- Automatic runs update `output/latest.json`.
- Explicit output paths are protected from artifact collisions unless `overwrite` is enabled.

Prompts that inspect a completed run prefer `output/latest.json` when no output directory is supplied.

## Related Docs

- [Documentation index](README.md)
- [Demo Anything](demo-anything.md)
- [Verification Matrix](verification-matrix.md)
