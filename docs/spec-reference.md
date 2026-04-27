# Spec Reference

Demo specs can be written as YAML, JSON, JSON5, or TOML. YAML with a `.demo.yaml` extension is the recommended format.

## Top-Level Fields

| Field       | Required | Purpose                                                       |
| ----------- | -------- | ------------------------------------------------------------- |
| `meta`      | Yes      | Title, resolution, and optional branding.                     |
| `runner`    | No       | Command, URL, healthcheck, and timeout for the target app.    |
| `pacing`    | No       | Cursor, typing, click, navigation, and settle timing.         |
| `narration` | No       | TTS provider, voice, and narration sync mode.                 |
| `preSteps`  | No       | Setup actions before capture, such as API calls or cookies.   |
| `chapters`  | Yes      | Ordered demo chapters, each with user-visible steps.          |
| `redaction` | No       | Selectors and secret patterns to hide in captures and output. |

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

## More Authoring Guidance

- [Demo Anything](demo-anything.md): practical authoring rules and example matrix.
- [Verification Matrix](verification-matrix.md): what each validation layer proves.
- [Demo Gallery](demo-gallery.md): visual examples to copy from.
