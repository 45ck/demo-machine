# Contributing to demo-machine

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/45ck/demo-machine.git
cd demo-machine

# Install dependencies
pnpm install

# Install Playwright browsers
pnpm exec playwright install chromium

# Build
pnpm build

# Run tests
pnpm test
```

## Prerequisites

- **Node.js** >= 22
- **pnpm** (package manager)
- **ffmpeg** on your PATH (for video rendering)
- **Playwright** (installed via `pnpm exec playwright install chromium`)

## Project Structure

```
src/
  cli.ts              # CLI entry point (commander)
  index.ts            # Public API exports
  spec/               # YAML spec parsing + Zod validation
  runner/             # App server lifecycle (spawn, healthcheck, stop)
  playback/           # Browser automation (cursor, typing, pacing)
  capture/            # Playwright video recording + event logging
  editor/             # Timeline builder + ffmpeg renderer
  narration/          # TTS providers + subtitle generation
  redaction/          # Blur selectors + secret scanning
  utils/              # Logger, process helpers
tests/                # Mirrors src/ structure, vitest
examples/             # Example specs + demo apps
```

## Development Workflow

1. **Create a branch** for your change
2. **Write tests first** — we maintain high coverage
3. **Run the full validation suite** before submitting:
   ```bash
   pnpm validate
   ```
   This runs lint, format check, spell check, typecheck, tests, knip, and dependency checks.
4. **Submit a PR** with a clear description

## Code Style

- TypeScript strict mode with `exactOptionalPropertyTypes`
- ESLint + Prettier enforced via pre-commit hooks
- No unused imports/exports (enforced by knip)
- Keep functions focused and files small

## Running a Demo Locally

```bash
# Build first
pnpm build

# Run the included todo-app example
node dist/cli.js run examples/todo-app.demo.yaml --output ./output --no-narration --no-headless
```

## Reporting Issues

- Use GitHub Issues
- Include your Node.js version, OS, and ffmpeg version
- Include the YAML spec and error output if applicable

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
