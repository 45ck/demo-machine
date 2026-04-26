# Getting Started

This guide gets you from a local checkout to a captured product demo.

demo-machine turns a versioned spec into a browser capture, a rendered product video, and reviewable artifacts. Keep the spec with the product code, run it locally, and use the generated artifacts to review or repair the demo.

## Setup

```bash
git clone https://github.com/45ck/demo-machine.git
cd demo-machine
pnpm install
pnpm exec playwright install chromium
pnpm build
```

Install FFmpeg and make sure it is on your `PATH` before running the full render pipeline.

## Run A Known Demo

Example specs are organized by purpose. Most user-facing demos live in `examples/showcase/`, proof fixtures live in `examples/proof/actions/` and `examples/proof/variants/`, and the long QA flow lives in `examples/assurance/long-demo/`.

Use the manifest-backed browser before choosing a spec:

```bash
node dist/cli.js examples list
node dist/cli.js examples list --tag forms
node dist/cli.js examples list --type proof
node dist/cli.js examples show controls-lab
```

By default, `examples list` shows showcase and assurance entries. Use `--type all` to include every manifest entry or `--type proof` when you need the small action-level specs. `examples show <slug>` prints the canonical spec path, variants, quality signals, and ready-to-run `run` and `validate` commands.

```bash
node dist/cli.js run examples/showcase/todo-app.demo.yaml --no-headless
```

For a raw capture without editing or narration:

```bash
node dist/cli.js capture examples/showcase/hello-world.demo.yaml --no-narration
```

By default each run writes to `./output/<spec-slug>/<run-id>` so repeat demos do not overwrite each other, and `./output/latest.json` points to the most recent automatic run. Supplying `--output <dir>` uses that exact directory; if it already contains demo artifacts, pass `--overwrite` only after confirming the old artifacts can be replaced.

Expected capture artifacts in the resolved output directory:

- `video.webm`
- `events.json`
- `metadata.json`
- `environment.json`
- `verification.json`
- `trace.zip`

## Create A Demo For Your App

Create the smallest useful spec:

```bash
node dist/cli.js init my-product.demo.yaml --url http://localhost:3000 --healthcheck http://localhost:3000/health --command "pnpm dev" --title "My Product Demo"
```

That writes a valid starter spec similar to this:

```yaml
meta:
  title: "My Product Demo"

runner:
  command: "pnpm dev"
  url: "http://localhost:3000"
  healthcheck: "http://localhost:3000/health"
  timeout: 30000

narration:
  enabled: true
  provider: kokoro
  sync:
    mode: auto-sync
    bufferMs: 500

chapters:
  - title: "First look"
    steps:
      - action: navigate
        url: "/"
        narration: "Open the product."
      - action: assert
        target:
          by: css
          selector: body
        visible: true
        narration: "Confirm the app shell is visible before recording interactions."
      - action: wait
        timeout: 1000
      - action: screenshot
        name: first-screen
```

Prefer structured targets such as `role`, `label`, `text`, and `testId` before raw CSS selectors. They make demos easier to read and less brittle when class names or DOM structure change.

## Validate Before Capturing

```bash
node dist/cli.js validate path/to/demo.yaml
pnpm examples:validate -- --no-build
```

`validate` loads the spec, applies schema defaults, and runs the pre-capture checks. Use it before spending time on video capture. `pnpm examples:validate` reads `examples/manifest.json` and validates the canonical specs plus listed variants, so it follows the organized examples layout instead of scanning old root-level specs.

## Make Narration Easier

Enable auto-sync so step timing follows narration length:

```yaml
narration:
  enabled: true
  provider: kokoro
  sync:
    mode: auto-sync
    bufferMs: 500
```

Then omit most per-step `delay` values. Keep manual delays only when you need a specific visual pause.

## Local Quality Gate

Before handing off a change:

```bash
pnpm local-ready
```

The repository does not currently rely on GitHub Actions. Local validation is the quality gate.

For examples and video QA, use the manifest-backed suite:

```bash
pnpm examples:validate -- --no-build
pnpm examples:capture -- --filter assurance-long-demo
node scripts/examples-suite.mjs --mode run --filter assurance-long-demo
pnpm video:assure -- --filter assurance-long-demo
```

`examples:capture` proves the browser flow and required capture artifacts. `--mode run` creates rendered `output.mp4` files under `output/example-suite/`, and `video:assure` samples those MP4s for blank frames, frozen spans, and large visual jumps. The long-demo filter targets `examples/assurance/long-demo/long-demo.demo.yaml` for full-flow QA.

## Where To Go Next

- Use `demo-machine examples list` to find a nearby pattern before authoring a new flow.
- Read [Demo Anything](docs/demo-anything.md) for the spec authoring playbook and acceptance matrix.
- Read [Verification Matrix](docs/verification-matrix.md) to understand what each local quality gate proves.
- Read the [Documentation Index](docs/README.md) for the full docs map.
- Read [Roadmap](ROADMAP.md) for current project priorities and non-goals.
