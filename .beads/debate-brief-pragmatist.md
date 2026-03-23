# Debate Brief: The Pragmatist Position

**Thesis:** Ship the minimum viable quality gate in one week. Low-complexity, zero-false-positive checks first. Everything else earns its way in with evidence of real failures.

---

## 1. My TOP 10 Picks

### Pick 1 -- ID 93: Spec YAML Schema Validation Fast Check (Tier 1, Low, Score 4.65)

This is the single cheapest check that catches the most common class of bug: someone edits a YAML spec and introduces a typo, a missing required field, or an invalid enum value. Zod validation of all 27 specs runs in under 3 seconds. We already have the schemas in `src/spec/step-schema.ts` and `src/spec/schema.ts`. This is not a "to build" item -- it is a "to wire into CI" item. One vitest file, one `paths:` filter on `examples/` and `src/spec/`. Done before lunch on day one.

### Pick 2 -- ID 42: Narration-Before-Action Temporal Ordering (Tier 1, Low, Score 4.85)

The highest-scored idea in the entire list for good reason. This catches the exact bug class we already fixed once (narration playing after its corresponding action due to timing cap logic). The check is pure data: parse `events.json` timestamps and `subtitles.vtt` cue start times, assert `narrationStart <= actionTimestamp` for every segment. No screenshots, no baselines, no pixel diffing. Zero false positives because it is a logical invariant, not a visual heuristic. If this check ever fires, it is always a real bug.

### Pick 3 -- ID 45: Resolution & Aspect Ratio Integrity Check (Tier 1, Low, Score 4.50)

`ffprobe` the output MP4, compare width/height/SAR/DAR against `spec.meta.resolution`. This is a 10-line function. We already have ffprobe available. The check is deterministic: either the dimensions match or they do not. This catches resolution inflation from the `--resolution` override, broken encoder settings, and the gallery 1920x1080 vs 1280x720 crop bug we already documented in MEMORY.md.

### Pick 4 -- ID 46: Audio-Video Duration Parity Check (Tier 1, Low, Score 4.50)

`ffprobe` both audio and video streams, assert duration difference is within 100ms. This catches the dual `-ss` trim bug (FIX-1 from domain Fagan pass 4) and any future `tpad` miscalculation. Same implementation pattern as ID 45 -- a few lines of ffprobe parsing. The signal-to-noise ratio is perfect: a duration mismatch of more than 100ms is always a real problem.

### Pick 5 -- ID 83: Output Video File-Size Budget Gate (Tier 1, Low, Score 4.40)

`fs.stat()` the output MP4. Compare against a per-spec budget stored in `manifest.json`. This is the canary in the coal mine for a whole class of silent failures: broken compression settings producing 500MB files, resolution inflation, truncated outputs that are suspiciously small. The implementation is trivial. The maintenance burden is near-zero because file size budgets do not change unless you intentionally change the spec.

### Pick 6 -- ID 26: Pointer-Events-None Detector (Tier 1, Low, Score 4.30)

A single `getComputedStyle(el).pointerEvents` check before every interactive action. Playwright will happily force-click an element with `pointer-events: none`, producing a demo where the viewer sees a click on a visually disabled button with no response. This is a silent corruption of the demo's credibility. The check is one line of `page.evaluate`, and it is always actionable -- if pointer-events is none, the demo spec is targeting the wrong element.

### Pick 7 -- ID 30: Invisible Text Content Assertion (Tier 1, Low, Score 4.30)

After every `type` action, read back `locator.inputValue()` and compare against `step.text`. This catches input masks that silently truncate, `maxlength` attributes that eat characters, and React controlled components that overwrite the typed value. The cost is one extra Playwright call per type step. The signal is perfect: if the input does not contain what you typed, the demo is lying to the viewer.

### Pick 8 -- ID 86: Playwright Trace Artifact Upload on Failure (Tier 1, Low, Score 4.60)

When a capture fails in CI, upload `trace.zip` as an artifact and post a link to `trace.playwright.dev` in the PR comment. This transforms CI debugging from "reproduce locally and squint at logs" to "click link, see the DOM state, network requests, and console errors at the moment of failure." The implementation is a few lines of GitHub Actions YAML. This is not a quality gate itself, but it makes every other quality gate 10x more useful by making failures diagnosable.

### Pick 9 -- ID 37: Orphaned Overlay Leak Detector (Tier 1, Med, Score 4.20)

This is the one Medium-complexity pick I am willing to fight for. After playback completes, scan the DOM for any visible `dm-*` overlay elements (cursor, focus ring, tooltips, toasts). If overlays are still present, they will appear in the rendered video as visual artifacts. The implementation is a single `page.$$eval('[class*="dm-"]')` call. The reason this earns its complexity rating is that you need to run it at the right moment (after all steps, before teardown), but that is a one-time integration point, not ongoing maintenance.

### Pick 10 -- ID 58: Video Container & Codec Compliance Check (Tier 2, Low, Score 4.05)

`ffprobe` for codec=H.264, container=MP4, pixel_format=yuv420p, profile=High. This is three more lines on top of the ffprobe checks from IDs 45 and 46. The reason it matters: a demo video that plays on Chrome but fails on Safari or iOS is a silent failure that nobody catches until a customer reports it. yuv420p and H.264 High profile are non-negotiable for cross-browser playback. This check runs once, never false-positives, and prevents an embarrassing class of "works on my machine" bugs.

---

## 2. The REJECT List -- Overrated Tier 1 and Tier 2 Ideas

### ID 2: Step-Aligned Screenshot Snapshots (Tier 1, Med, Score 4.50) -- REJECT

This is the poster child for the maintenance trap. "Screenshot at each step boundary, diff against baselines with pixelmatch." Sounds great in a slide deck. In practice: you now maintain 27 specs times ~10 steps each = 270 baseline images. Every time you change a CSS color, update a library, or bump a browser version, you regenerate baselines. Every time a font renders 1 pixel differently on a CI runner vs your laptop, you triage a false positive. The pixelmatch threshold tuning is a treadmill -- too tight and you drown in noise, too loose and you miss real regressions. This idea has a Medium complexity rating but it has High ongoing maintenance cost, which the scoring criteria does not adequately weight.

### ID 21: Pre-Click Hit-Test Gate (Tier 1, Med, Score 4.50) -- DEFER, NOT REJECT

`elementFromPoint()` before every click is a good idea in principle, but it requires careful handling of overlapping elements, sticky headers, cookie banners, and our own `dm-*` overlays. The implementation is deceptively simple; the edge cases are not. I would revisit this after the first 10 checks are stable, not before.

### ID 81: Tiered CI Matrix (Tier 1, Med, Score 4.35) -- PREMATURE

We have 27 specs. Running all 27 in CI takes -- what, 15 minutes? We do not have the volume problem that justifies sharding yet. Build the quality gates first, then optimize their execution speed. Tiering is an optimization, not a quality check.

### ID 87: events.json Structural Diff (Tier 1, Med, Score 4.25) -- BASELINE TRAP

Same problem as screenshot baselines but in JSON form. You are now maintaining 27 baseline events.json files that change every time you adjust timing, add a new overlay, or reorder steps. The diff will flag "changed" on every PR that touches playback logic, which is exactly when you do not want noise.

### ID 1: Frame-by-Frame Baseline Diffing (Tier 2, Med, Score 4.10) -- REJECT

This is ID 2 but worse. Instead of 270 screenshots, you are storing thousands of extracted frames in LFS. The storage, the baseline updates, the CI download time, the false positive rate -- all of it scales linearly with the number of specs and the duration of each demo. This is the kind of infrastructure that makes a team slower, not faster.

### ID 55: Frame Rate Consistency & Drop Detection (Tier 2, Med, Score 4.10) -- LOW PRIORITY

Frame drops in the output MP4 are caused by ffmpeg encoding issues, not by our application logic. If they happen, they happen consistently for a given ffmpeg version and flags. This is worth checking once manually, not on every CI run.

### ID 92: Screenshot Baseline Store with pixelmatch (Tier 4, High, Score 2.90) -- HARD REJECT

The scoring system got this one right by putting it at rank 99. Git LFS for screenshot baselines is the canonical example of infrastructure that consumes more engineering time than the bugs it catches. Every baseline update is a multi-step ritual: regenerate, review diffs visually, commit to LFS, push. Multiply by 27 specs and do this every time Playwright bumps a Chromium version.

---

## 3. Proposed Implementation Order

### Sprint 1 (Days 1-3): The Five-Minute Quality Gate

**Goal:** A single CI job that runs in under 30 seconds and catches the most common failure modes.

- **ID 93** -- Spec schema validation (day 1 morning, 2 hours)
- **ID 45** -- Resolution/aspect ratio check (day 1 afternoon, 1 hour)
- **ID 46** -- Audio-video duration parity (day 1 afternoon, 30 minutes -- same ffprobe infrastructure)
- **ID 58** -- Codec compliance check (day 1 afternoon, 30 minutes -- same ffprobe call)
- **ID 83** -- File-size budget gate (day 2 morning, 2 hours including manifest.json population)
- **ID 86** -- Trace upload on failure (day 2 afternoon, 2 hours of Actions YAML)
- **Wire all six** into a `quality-gate.test.ts` vitest file and a CI workflow (day 3)

Total: ~3 days, 6 checks, all Low complexity, zero baselines to maintain.

### Sprint 2 (Days 4-6): Runtime Playback Guards

**Goal:** Catch demo correctness issues during capture, not after rendering.

- **ID 42** -- Narration temporal ordering (day 4, 3 hours)
- **ID 26** -- Pointer-events-none detector (day 4, 1 hour -- one `page.evaluate` in action dispatch)
- **ID 30** -- Input readback assertion (day 5, 2 hours -- hook into type handler)
- **ID 37** -- Orphaned overlay detector (day 5-6, 4 hours -- post-playback DOM scan + tests)

Total: ~3 days, 4 checks. IDs 26 and 30 are inline checks that run during capture; 42 runs post-render; 37 runs post-playback.

### Sprint 3 (Days 7-8): Polish and Observability

- **ID 58** already done in Sprint 1
- **ID 94** (Tier 2) -- `vitest --related` for faster PR feedback (2 hours)
- **ID 100** (Tier 3) -- `quality-verify.mjs` consolidated dashboard (half day)
- Write documentation for the quality gate, including how to add new checks
- Retrospective: review any real failures caught in the first week, decide what to add next

Total: 1-2 days of polish. The full quality gate is now live, maintained, and extensible.

**Grand total: 8 working days, 10 checks, zero baseline images, zero LFS, zero pixel diffing.**

---

## 4. The Case Against Visual Regression and Video QA Heavy Approaches

The Visual Regression domain has 20 ideas. Three are Low complexity. Twelve are Medium. Five are High. The domain average score is 3.60 -- the second-lowest of all five domains. This is not a coincidence. The scoring criteria penalize these ideas because they have poor signal-to-noise ratios and high maintenance costs.

Here is the core problem with pixel-based quality checks for demo-machine: **the thing you are screenshotting is a third-party web application that you do not control.** When the example app's CSS changes, when the browser's font rendering changes, when the CI runner's GPU driver differs from your laptop -- the screenshots change. None of these are bugs in demo-machine. They are environmental variance that your quality gate must now distinguish from actual regressions. That distinction is where all the complexity lives, and it is where all the false positives come from.

Every false positive has a concrete cost: a developer stops what they are doing, opens the CI results, eyeballs a diff image, decides "this is just font rendering," and clicks "approve." Multiply that by the number of PRs per week and the number of baseline images, and you have a quality gate that trains developers to ignore it. A quality gate that developers ignore is worse than no quality gate at all, because it provides false confidence.

The metadata-based checks I am proposing (resolution, duration, codec, file size, narration ordering) have a fundamentally different failure mode profile. They are binary: either the MP4 is 1920x1080 or it is not. Either the narration starts before the action or it does not. There is no threshold to tune, no baseline to update, no "is this a real diff or just anti-aliasing?" judgment call. When they fail, you fix the bug. When they pass, you trust them.

The Video QA heavy approaches (IDs 43, 49, 50, 60) require frame-by-frame extraction, computer vision analysis, and carefully tuned thresholds. ID 43 (Cursor Teleportation Detection) needs to track cursor position at 60fps and define what constitutes a "jump." ID 49 (Subtitle-Audio Alignment) needs RMS energy analysis. ID 50 (Click Ripple Verification) needs to detect expanding concentric rings. These are research projects disguised as CI checks. Each one will take a week to implement, a month to stabilize, and will generate a steady stream of "is this a real failure?" triage tickets.

**My rule of thumb:** if a check requires you to look at an image to decide whether it passed, it is not automated. It is a semi-automated triage generator. Save those for quarterly manual review sessions. For CI, ship the checks that produce a boolean and move on.

The right time to add visual regression is when you have evidence that the metadata checks are insufficient -- when you have a real bug that slipped through all 10 of my proposed checks and would only have been caught by pixel diffing. That bug will tell you exactly which visual check to add and exactly what threshold to use. Until then, YAGNI.
