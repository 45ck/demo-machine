# Getting Started

This guide gets you from a local checkout to a captured product demo.

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

```bash
node dist/cli.js run examples/todo-app.demo.yaml --output ./output --no-headless
```

For a raw capture without editing or narration:

```bash
node dist/cli.js capture examples/hello-world.demo.yaml --output ./output/hello --no-edit --no-narration
```

Expected capture artifacts:

- `video.webm`
- `events.json`
- `metadata.json`
- `environment.json`
- `verification.json`
- `trace.zip`

## Create A Demo For Your App

Create the smallest useful spec:

```bash
node dist/cli.js init my-product.demo.yaml --url http://localhost:3000 --command "pnpm dev" --title "My Product Demo"
```

That writes a valid starter spec similar to this:

```yaml
meta:
  title: "My Product Demo"

runner:
  command: "pnpm dev"
  url: "http://localhost:3000"
  timeout: 30000

chapters:
  - title: "Open the app"
    steps:
      - action: navigate
        url: "/"
        narration: "Open the product dashboard."
      - action: click
        target:
          by: role
          role: button
          name: "Create"
        narration: "Create a new item."
```

Prefer structured targets such as `role`, `label`, `text`, and `testId` before raw CSS selectors. They make demos easier to read and less brittle when class names or DOM structure change.

## Validate Before Capturing

```bash
node dist/cli.js validate path/to/demo.yaml
pnpm examples:validate -- --no-build
```

`validate` loads the spec, applies schema defaults, and runs the pre-capture checks. Use it before spending time on video capture.

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
