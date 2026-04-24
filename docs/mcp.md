# MCP Integration

demo-machine ships an MCP server so AI assistants can help author, validate, run, review, and repair demos.

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

## Output Behavior

`capture-spec` and `run-pipeline` use the same output rules as the CLI:

- Omitted output creates a safe `output/<spec-slug>/<run-id>` directory.
- Automatic runs update `output/latest.json`.
- Explicit output paths are protected from artifact collisions unless `overwrite` is enabled.

Prompts that inspect a completed run prefer `output/latest.json` when no output directory is supplied.
