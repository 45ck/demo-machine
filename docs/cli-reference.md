# CLI Reference

Run commands with `demo-machine` after installation, or with `node dist/cli.js` from a local checkout after `pnpm build`.

## Commands

```bash
demo-machine run <spec.yaml>
```

Runs the full pipeline: validate, start the app if configured, capture browser activity, render `output.mp4`, and write quality artifacts.

```bash
demo-machine validate <spec.yaml>
```

Loads the spec, applies defaults, and runs pre-capture validation without launching a full recording.

```bash
demo-machine init <path.demo.yaml> --url <url> --command <command>
```

Creates a starter spec for an app. Add `--healthcheck <url>` when the app has a readiness endpoint.

```bash
demo-machine capture <spec.yaml>
```

Captures raw browser evidence only: `video.webm`, `events.json`, manifests, screenshots, and trace.

```bash
demo-machine edit <events.json>
```

Re-renders from an existing capture. `video.webm` must be beside the event log.

```bash
demo-machine analyze <output-dir>
demo-machine analyze --latest --spec <spec.yaml>
```

Generates analyzer review artifacts for an existing run without recapturing or
rerendering. The command auto-detects `output.mp4` first and then `video.webm`
inside the output directory.

```bash
demo-machine examples list
demo-machine examples show <slug>
```

Finds example specs by pattern, quality signal, or search term.

```bash
demo-machine doctor
```

Checks local browser, FFmpeg, disk, and TTS prerequisites.

## Common Options

| Flag                             | Default                | Description                                                     |
| -------------------------------- | ---------------------- | --------------------------------------------------------------- |
| `-o, --output <dir>`             | `./output/<slug>/<id>` | Output directory. Explicit paths are protected from collisions. |
| `--overwrite`                    | -                      | Allow writing into an explicit output directory with artifacts. |
| `--no-narration`                 | -                      | Skip TTS narration.                                             |
| `--no-edit`                      | -                      | For `run`, raw capture only and skip rendering.                 |
| `--no-headless`                  | -                      | Show the browser window.                                        |
| `--renderer <name>`              | `ffmpeg`               | Video renderer.                                                 |
| `--tts-provider <name>`          | `kokoro`               | TTS provider: `kokoro`, `openai`, `elevenlabs`, or `piper`.     |
| `--tts-voice <id>`               | -                      | Provider-specific voice id.                                     |
| `--narration-sync <mode>`        | `manual`               | `manual`, `auto-sync`, or `warn-only`.                          |
| `--narration-buffer <ms>`        | `500`                  | Lead-in buffer for narration sync.                              |
| `--resolution <WxH>`             | spec value             | Override capture resolution.                                    |
| `--change-detection <mode>`      | spec value             | `error`, `warn`, or `off`.                                      |
| `--strict-geometry`              | -                      | Fail on viewport geometry mismatch.                             |
| `--from-chapter <title>`         | -                      | Trim output to start from a chapter.                            |
| `--from-step <index>`            | -                      | Trim output to start from a step index.                         |
| `--trim-start-ms <ms>`           | `0`                    | Additional render trim offset.                                  |
| `--select-approach <A\|B\|C\|D>` | `C`                    | Select dropdown visual strategy.                                |
| `--timeline`                     | -                      | Print narration timeline after rendering.                       |
| `--verbose`                      | -                      | Debug logging.                                                  |

## Analyze Options

| Flag              | Default | Description                                                          |
| ----------------- | ------- | -------------------------------------------------------------------- |
| `--latest`        | -       | Analyze the run pointed to by `output/latest.json` under `--output`. |
| `--spec <path>`   | -       | Include the original spec path in `review-prompt.md`.                |
| `--video <path>`  | -       | Analyze a specific video instead of auto-detecting a run video.      |
| `--layout <path>` | -       | Include layout annotations in layout-safety review.                  |
| `--no-ocr`        | -       | Skip OCR-backed storyboard and transition extraction.                |

## Output Rules

When `--output` is omitted, each run writes to `output/<spec-slug>/<run-id>` and updates `output/latest.json`.

When `--output <dir>` is supplied, demo-machine uses that exact directory. If known demo artifacts already exist there, the command fails before capture unless `--overwrite` is supplied.

Stable artifact names are kept inside every run directory:

- `output.mp4`
- `video.webm`
- `events.json`
- `metadata.json`
- `environment.json`
- `verification.json`
- `quality.json`
- `trace.zip`
- `screenshots/manifest.json`

Analyzer artifacts are optional but stable when generated by
`demo-machine analyze`:

- `review-bundle.json`
- `review-prompt.md`
- `video.shots.json`
- `segment.evidence.json`
- `layout-safety.report.json`
- `demo-capture-evidence.json` when screenshot or event evidence exists
- `segment-storyboard/storyboard.manifest.json`
- `segment-storyboard/storyboard.ocr.json` unless `--no-ocr`
- `segment-storyboard/storyboard.transitions.json` unless `--no-ocr`

When `layout-safety.report.json`, `segment.evidence.json`, or
`review-bundle.json` are present beside `output.mp4`, the quality gate includes
their pass/warn/fail findings in the next `quality.json`.
