# Changelog

## Unreleased

### Added

- Schema-validated, deterministic static share viewers with native video,
  timestamp deep links, chapters, searchable and copyable transcripts,
  playback speed, persistent synthetic-profile context, completion calls to
  action, safe embed-header contracts, a hash-based Content Security Policy,
  and a machine-readable integration manifest.

## 0.3.0 — 2026-04-24

### Added

- Full pre-capture validation registration before capture
- Expanded action/target verification coverage and runtime guard parity
- Local-first docs and `demo-machine init` starter spec generation
- Run-safe default output directories, `output/latest.json`, explicit `--overwrite`, and clearer CLI/MCP run summaries
- Project roadmap documenting current direction, near-term priorities, and non-goals

### Changed

- GitHub Actions workflows were removed; local validation is now the documented quality gate
- CLI and MCP server version reporting now follows `package.json`
- Documentation was consolidated around current local authoring and release workflows
- MCP documentation now reflects the current 5 tools, 4 resources, and 8 prompts

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
