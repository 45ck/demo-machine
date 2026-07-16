# Spec Reference

Demo specs can be written as YAML, JSON, JSON5, or TOML. YAML with a `.demo.yaml` extension is the recommended format.

## Top-Level Fields

| Field       | Required | Purpose                                                               |
| ----------- | -------- | --------------------------------------------------------------------- |
| `meta`      | Yes      | Title, resolution, and optional branding.                             |
| `runner`    | No       | Command, URL, healthcheck, and timeout for the target app.            |
| `pacing`    | No       | Cursor, typing, click, navigation, and settle timing.                 |
| `narration` | No       | TTS provider, voice, and narration sync mode.                         |
| `preSteps`  | No       | Setup actions before capture, such as API calls or cookies.           |
| `chapters`  | Yes      | Ordered demo chapters, each with user-visible steps.                  |
| `redaction` | No       | Selectors and secret patterns to hide in captures and output.         |
| `share`     | No       | Static chaptered viewer, publication flags, and safe calls to action. |

## Minimal Spec

```yaml
meta:
  title: "My Demo"

runner:
  url: "http://localhost:3000"

chapters:
  - title: "Getting Started"
    steps:
      - action: navigate
        url: "/"
      - action: click
        target:
          by: role
          role: button
          name: "Get Started"
```

Relative `navigate.url` values are resolved against `runner.url`.

## Actions

| Action                        | Required Fields                           | Description                              |
| ----------------------------- | ----------------------------------------- | ---------------------------------------- |
| `navigate`                    | `url`                                     | Go to a URL.                             |
| `click`                       | `selector` or `target`                    | Click an element.                        |
| `clickFirstVisible`           | `selector`                                | Click the first visible matching item.   |
| `check`                       | `selector` or `target`                    | Check a checkbox or toggle.              |
| `uncheck`                     | `selector` or `target`                    | Uncheck a checkbox or toggle.            |
| `type`                        | `selector` or `target`, `text`            | Type text character-by-character.        |
| `select`                      | `selector` or `target`, `option`          | Select an option in a `<select>`.        |
| `selectFirstNonPlaceholder`   | `selector` or `target`                    | Select the first non-placeholder option. |
| `upload`                      | `selector` or `target`, `file` or `files` | Upload files through a file input.       |
| `hover`                       | `selector` or `target`                    | Hover over an element.                   |
| `scroll`                      | Optional `selector`/`target`, `x`, `y`    | Scroll the page or a container.          |
| `wait`                        | `timeout`                                 | Pause for milliseconds.                  |
| `waitForLocalDirectoryStable` | `path`                                    | Wait for local file writes to settle.    |
| `waitForLocalFile`            | `path` or `paths`                         | Wait for local file evidence.            |
| `waitForPageFunction`         | `expression`                              | Wait for a browser-side condition.       |
| `evaluate`                    | `expression`                              | Run a browser-side setup/proof script.   |
| `runCommand`                  | `command`                                 | Run a local command during capture.      |
| `press`                       | `key`                                     | Press a keyboard key.                    |
| `back`                        | -                                         | Go back in browser history.              |
| `forward`                     | -                                         | Go forward in browser history.           |
| `assert`                      | `selector` or `target`                    | Assert visibility or text content.       |
| `screenshot`                  | Optional `name`                           | Capture screenshot evidence.             |
| `dragAndDrop`                 | `from`, `to`                              | Drag from one target to another.         |

Every action supports optional `narration`, `delay`, and `timeoutMs` where relevant.

`waitForLocalFile` resolves relative paths against the spec directory. Add `contains` to require
each target file to include specific text before the demo continues.
`waitForLocalDirectoryStable` resolves its path the same way and waits until recursive file count,
latest write time, and total size stop changing for `stableMs`.
`runCommand` executes from the spec directory by default, supports optional `cwd`, `env`, and
`timeoutMs`, fails the capture on timeout or non-zero exit, and writes stdout/stderr logs under the
demo output directory when one is available.
`evaluate` executes a trusted browser-side script body as `new Function("arg", expression)`. Use
`argFromEnv` when the script needs a secret; the event log records only `label`, not the expression
or argument value.

## Targets

Prefer structured `target` locators over raw CSS selectors:

```yaml
- action: click
  target:
    by: role
    role: button
    name: "Save"
    exact: true
```

Supported target strategies:

- `role`
- `testId`
- `label`
- `placeholder`
- `text`
- `altText`
- `title`
- `css`

Use `nth` when a selector or target matches multiple elements:

```yaml
- action: click
  selector: "button"
  nth: 1
```

## Narration

```yaml
narration:
  enabled: true
  provider: kokoro
  sync:
    mode: auto-sync
    bufferMs: 500
```

Providers:

- `kokoro`: local default
- `piper`: local, requires Piper installation
- `openai`: cloud, requires `OPENAI_API_KEY`
- `elevenlabs`: cloud, requires `ELEVENLABS_API_KEY`

## Redaction

```yaml
redaction:
  selectors:
    - ".user-email"
    - "[data-sensitive]"
  secrets:
    - "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z]{2,}\\b"
```

Use redaction for sensitive UI text, tokens, accounts, or customer data.

## Share Viewer

```yaml
share:
  summary: "Follow the workflow from intake to handover."
  profile:
    label: "Aged Care"
    syntheticBoundary: "Synthetic demonstration data only. Not for clinical use."
  brand:
    name: "Example Health"
    primary: "#57d6b0"
    background: "#101723"
  primaryCta:
    label: "Test it yourself"
    url: "https://demo.example.com"
  secondaryCta:
    label: "Book a call"
    url: "/contact"
  poster: "poster.png"
  noindex: true
  publicSafe: true
  embedMode: "deny"
```

The summary, profile label, synthetic-boundary statement, and primary call to
action are required. `title` defaults to `meta.title`; the secondary call to
action and poster are optional. Video and caption filenames default to
`output.mp4` and `subtitles.vtt`. `embedMode` defaults to `deny`; only the
explicit `same-origin` value produces a same-origin framing header contract.
The generator accepts only sibling media filenames and HTTPS, loopback HTTP,
or safe same-origin call-to-action links. See [Share Viewer](share-viewer.md)
for the runtime, accessibility, privacy, and publication contract.

## More Authoring Guidance

- [Demo Anything](demo-anything.md): practical authoring rules and example matrix.
- [Verification Matrix](verification-matrix.md): what each validation layer proves.
- [Demo Gallery](demo-gallery.md): visual examples to copy from.
