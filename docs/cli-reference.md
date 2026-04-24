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
