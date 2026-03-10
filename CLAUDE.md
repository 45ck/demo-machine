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
- Pre-push: vitest, knip, dep-check
- `src/editor/` must NOT import from `src/playback/` — use `src/capture/types.ts`

## Test Framework

- **vitest** — run with `npm test`
- 331 tests across 22 files
- Mock `../../src/playback/visuals.js` inline with `vi.mock()` factory (no hoisted variables)

## Key Conventions

- New step actions → entry in `src/playback/actions.ts` actionHandlers map
- Step schemas → `src/spec/step-schema.ts`
- Public API exports → `src/index.ts`
- Assert steps produce **zero visual effects** — no `pulseFocus`, no `flashSpotlight`
