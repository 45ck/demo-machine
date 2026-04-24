# Changelog

## 0.3.0 — 2026-04-24

### Added

- Full pre-capture validation registration before capture
- Expanded action/target verification coverage and runtime guard parity
- Local-first docs and `demo-machine init` starter spec generation

### Changed

- GitHub Actions workflows were removed; local validation is now the documented quality gate
- CLI and MCP server version reporting now follows `package.json`
- Documentation was consolidated around current local authoring and release workflows

## 0.2.0 — 2026-03-11

### Added

- MCP server (`demo-machine-mcp`) — 5 tools, 3 resources, 2 prompts for Claude Desktop integration
- `clickFirstVisible`, `selectFirstNonPlaceholder` step actions
- Pre-steps: `httpRequest`, `setCookie`, `setLocalStorage`
- Voice cloning via ElevenLabs (`demo-machine voices clone`)
- Dead-time compression, callout zoom, narration auto-sync mode
- `quality:verify` / `quality:verify:strict` verification inventory tooling
- 15 new example suites covering forms, auth, overlays, routing, async, tables, charts,
  virtualization, selector stress, drag-sort, file upload, and API pre-seeding

### Fixed

- `specDir` is now accepted as an explicit option in `PipelineOptions` — programmatic callers
  with `upload` steps no longer rely solely on `specPath` for relative file resolution

## 0.1.0 — Initial release

- Core pipeline: YAML spec → Playwright capture → FFmpeg render → MP4
- 18 step actions, 4 TTS providers (Kokoro, OpenAI, ElevenLabs, Piper), redaction engine
