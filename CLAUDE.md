# demo-machine — Claude Code Instructions

## Presenting Results to the User

### Always use an HTML viewer for video/MP4 review

When generating or regenerating demo MP4s for user review, **always create and open an HTML viewer** rather than opening individual files.

**Pattern:**

1. Generate all MP4s
2. Write `output/example-suite/review.html` — a dark-themed grid with `<video controls muted loop playsinline>` cards
3. Serve it via `output/example-suite/serve.mjs` over HTTP (not `file://`) so videos load and seek correctly
4. Open `http://localhost:5555` in the browser

**Why HTTP not file://:** Browsers enforce `Accept-Ranges` / byte-range requests for video seeking and some block `file://` video entirely. A minimal Node HTTP server with range support (already in `serve.mjs`) fixes this.

**HTML viewer conventions:**

- Dark background (`#0d0f14`), cards with native `<video>` player controls
- `IntersectionObserver` autoplay — videos play when scrolled into view, pause when out
- Filter bar by category (new / autosync / redaction / core)
- Colour-coded tags: green=new, blue=autosync, purple=redaction
- Grid: `repeat(auto-fill, minmax(560px, 1fr))`

**Serve script:** `node output/example-suite/serve.mjs`
Opens at `http://localhost:5555`

---

## Git Workflow

- **Never bypass hooks** — no `--no-verify`
- Pre-commit: prettier, eslint, cspell
- Pre-push: vitest, coverage, knip, dep-check
- `src/editor/` must NOT import from `src/playback/` — use `src/capture/types.ts`

## Test Framework

- **vitest** — run with `pnpm test`
- 1044 tests across 96 files
- Mock `../../src/playback/visuals.js` inline with `vi.mock()` factory (no hoisted variables)

## Key Conventions

- New step actions → entry in `src/playback/actions.ts` actionHandlers map
- Step schemas → `src/spec/step-schema.ts`
- Public API exports → `src/index.ts`
- Assert steps produce **zero visual effects** — no `pulseFocus`, no `flashSpotlight`

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->

## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
