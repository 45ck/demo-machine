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
  mcp-server.ts       # MCP server entry point (Claude tool integration)
  index.ts            # Public API exports
  mcp/                # MCP server: tools, resources, prompts
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
   This is the main local quality gate and runs lint, format check, spell check, typecheck, tests, knip, dependency checks, and the machine-readable quality inventory check.
4. **Review the verification inventory** when you add or expand a feature:
   ```bash
   pnpm quality:verify
   ```
   This reports supported actions, target strategies, and quality signals that still lack example proof.
5. **Submit a PR** with a clear description

## Quality Gates

- Pull requests must pass the CI workflow, which currently runs `pnpm build` and `pnpm validate`.
- CI also validates the example suite definitions with:
  ```bash
  pnpm examples:validate -- --no-build
  ```
- `pnpm examples:capture` now validates the raw capture artifact contract as well:
  `video.webm`, `events.json`, `metadata.json`, `environment.json`, `verification.json`, and `trace.zip`.
- GitHub CodeQL runs separately to catch security-oriented JavaScript/TypeScript issues that the local toolchain will not always surface.
- If you touch parser, redaction, playback orchestration, or timing logic, consider running mutation testing before opening the PR:
  ```bash
  pnpm mutation
  ```
- `pnpm mutation` is a heavier full-repo Stryker run, so use it selectively for logic-heavy changes rather than as a blanket requirement for every docs-only or wiring-only change.
- The verification inventory is documented in `docs/verification-matrix.md`, with machine-readable sources in `docs/verification-inventory.json` and `examples/manifest.json`.

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
