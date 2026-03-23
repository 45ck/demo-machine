# Debate Brief: The Quality Maximalist Position

**Position:** Demos ARE the product. Visual quality is non-negotiable. A comprehensive visual regression and video QA pipeline is not a luxury -- it is the minimum responsible engineering standard for a tool whose entire purpose is producing polished video artifacts.

---

## 1. My Top 15 Picks and Why Each Is Essential

### The Visual Foundation (Must-Have)

**#2 -- Step-Aligned Screenshot Snapshots (Score 4.50).** This is the single most important idea on the list. Every step boundary gets a full-page screenshot, diffed against baselines with pixelmatch. This is our Chromatic. Without it, we are shipping demos blind. A CSS regression in the target app, a layout shift from a late-loading font, a wrong-page navigation after a misrouted SPA transition -- unit tests see none of this. Step-aligned snapshots see all of it.

**#1 -- Frame-by-Frame Baseline Diffing of Rendered MP4s (Score 4.10).** The screenshot catches the browser state. The frame diff catches the rendered artifact -- the thing the viewer actually sees. Encoding artifacts, filter_complex glitches, drawtext rendering failures, and overlay timing all live in the gap between "browser looked fine" and "MP4 looks wrong." We already have pixelmatch as a dependency. Extracting frames from MP4 at fixed intervals and diffing them is the only way to close that gap.

**#7 -- Focus Ring and Pulse Effect Regression Testing (Score 3.90).** This is not theoretical. We had the phantom highlight bug: `pulseFocus` was being called during `assert` steps, drawing a visible focus ring on elements the cursor had never visited. The regression test in `engine.test.ts` at line 260 catches the function call, but it does NOT verify the visual output. A future refactor could reintroduce the visual artifact through a different code path -- say, a new overlay system that doesn't go through `pulseFocus` at all. Only a screenshot proving zero visual change during assert steps is definitive.

**#3 -- Cursor Overlay Position Validation (Score 3.95).** We fixed the drag-and-drop cursor desync where the cursor animated AFTER the drop completed instead of concurrently. The unit test in `engine.test.ts` line 447 checks `Promise.all` ordering, but it tests execution sequence, not pixel position. If someone changes the cursor interpolation curve, or if `moveCursorTo` introduces a 50ms delay, the unit test passes and the viewer sees a teleporting cursor. Visual position validation with a 5px tolerance is the only honest check.

### The Video QA Layer (Non-Negotiable)

**#42 -- Narration-Before-Action Temporal Ordering (Score 4.85).** The highest-scored idea on the entire list, and rightly so. We already fixed this bug once: `timing.ts` lines 36-48 implement a safety cap that prevents overlap prevention from pushing narration AFTER the action it describes. But the fix is subtle -- three nested loops with competing constraints. A future change to `GAP_MS`, `leadInBufferMs`, or the overlap prevention logic could silently reintroduce the regression. Parsing `events.json` + `subtitles.vtt` and asserting `narrationStart <= actionTimestamp` is a zero-false-positive check that runs in milliseconds.

**#46 -- Audio-Video Duration Parity Check (Score 4.50).** The dual `-ss` bug in `ffmpeg.ts` -- lines 23-33 -- is the canonical example. When `trimStartMs > 0`, we emit a second `-ss` flag before the audio input to keep audio and video in sync. Without it, the viewer hears narration that drifts further and further from the action it describes. An `ffprobe` check asserting audio and video durations within 100ms catches this class of bug with zero ambiguity.

**#45 -- Resolution and Aspect Ratio Integrity Check (Score 4.50).** Pure metadata, pure signal. `ffprobe` the output, compare against `spec.meta.resolution`. We already had the gallery resolution bug where 1920x1080 broke left-aligned containers. If the `--resolution` override or the renderer changes dimensions, this catches it instantly. No baselines, no flakiness, no maintenance.

**#47 -- Phantom Overlay Detection for Assert Steps (Score 3.90).** The visual complement to idea #7. Pixel-diff the video frames during assert steps for the `#32dcff` accent color used by `pulseFocus`. If any cursor movement or focus ring appears during an assert, the check fails. This catches the bug at the rendered artifact level, not just at the function-call level.

**#55 -- Frame Rate Consistency and Drop Detection (Score 4.10).** Frame drops are invisible in unit tests and completely visible to viewers. A demo that stutters at a key interaction moment looks broken. PTS analysis with ffprobe flags inter-frame intervals deviating more than 50% from median. This is cheap, automated, and catches an entire class of encoding/capture failures.

### Structural and Behavioral Guards

**#37 -- Orphaned Overlay Leak Detector (Score 4.20).** After playback completes, scan the DOM for lingering `dm-cursor`, `dm-focus-ring`, and other overlay elements. We inject overlays for cursor animation, focus rings, select toasts, file picker panels, and key badges. Any of these could leak if a step throws mid-animation and the cleanup handler doesn't fire. A leaked overlay renders into every subsequent frame of the video. This is a post-playback DOM scan -- trivial to implement, impossible to replicate with unit tests.

**#6 -- Chapter Title Card Diffing (Score 3.95).** Chapter titles go through `escapeDrawtext` (lines 157-168 of `ffmpeg.ts`), which handles `%`, newlines, backslashes, quotes, colons, semicolons, brackets, and equals signs. We already fixed the `%` crash (replacing with `%%`) and the newline crash (replacing with space). But `escapeDrawtext` is a function that will accumulate edge cases forever. Diffing the first frame of each chapter title against a baseline catches rendering failures that no amount of string-escaping unit tests can anticipate.

**#87 -- events.json Structural Diff as PR Check (Score 4.25).** When a PR changes action handler logic, the spec might still "pass" -- all steps complete without errors -- but the interactions could be fundamentally different. A navigate that used to `waitUntil: "domcontentloaded"` now waits for `networkidle`, adding 3 seconds of dead time. A click that used to hit the button now hits a wrapper div. Structural diffing of `events.json` against the master baseline catches behavioral regressions that are invisible to pass/fail testing.

**#21 -- Pre-Click Hit-Test Gate (Score 4.50).** `document.elementFromPoint()` before every click. Playwright will happily force-click through cookie banners, sticky headers, and modal backdrops. The click "succeeds" in the test, but in the rendered video, the viewer sees the cursor click on an obscured element and wonders why nothing happened. Hit-test gating turns a silent success into an explicit failure.

### Infrastructure That Serves Quality

**#81 -- Tiered CI Matrix (Score 4.35).** The Pragmatist will say "visual tests are too slow for CI." The tiered matrix is the answer: 5 critical specs on every PR, full 27 nightly. This makes visual regression testing practical without blocking developer velocity. The cost of the nightly run is amortized across a full day of development.

**#83 -- Output Video File-Size Budget Gate (Score 4.40).** A `stat()` call against a per-spec budget in `manifest.json`. If a resolution change doubles the file size, or a broken compression pipeline produces 500MB files, this catches it before anyone downloads a bloated artifact. Trivial to implement, zero false positives.

---

## 2. Why "Just Use Unit Tests and Cheap Checks" Will Miss Real Regressions

The Pragmatist position -- run unit tests, validate schemas, skip visual testing -- is built on a fundamental category error: **the assumption that internal correctness implies external correctness.**

Consider the four bugs we have already shipped and fixed:

**The phantom highlight bug.** `assert` steps were calling `pulseFocus`, drawing a visible focus ring on elements the user never interacted with. The unit test that caught this (`engine.test.ts` line 260) verifies that `pulseFocus` is not called. But suppose someone adds a new overlay system -- call it `highlightTarget` -- that is invoked from a middleware layer rather than from the action handler. The unit test passes. The viewer sees a phantom glow. Only a pixel-level screenshot or frame diff of the rendered output during assert steps catches this.

**The cursor desync during drag-and-drop.** The fix was `Promise.all([moveCursorTo(toBox), dragTo(...)])`. The unit test checks execution order. But cursor position is a continuous value, not a boolean. If the cursor interpolation function changes, or if `moveCursorTo` resolves early, the cursor arrives at the destination 200ms before the dragged element. The unit test passes. The viewer sees a cursor teleport. Only cursor position validation at the pixel level catches this.

**The narration timing cap.** The `adjustTiming` function has three phases: lead-in shift, overlap prevention, and safety cap. The unit test verifies the final `startMs` values. But the test operates on synthetic segments with predictable durations. In production, TTS audio files have variable durations that interact with the overlap prevention logic in unpredictable ways. The only definitive check is temporal ordering verification on the rendered artifact: parse the actual `subtitles.vtt` and `events.json`, assert `narrationStart <= actionTimestamp`.

**The dual `-ss` audio desync.** When `trimStartMs > 0`, ffmpeg needs `-ss` before BOTH the video input and the audio input. Missing the second `-ss` causes progressive audio drift. The unit test verifies the args array contains two `-ss` flags. But if someone refactors `buildArgs` to use a helper function that deduplicates flags, the test might need updating and the deduplication might silently remove the second `-ss`. An `ffprobe` duration parity check on the rendered output catches this regardless of how the args are constructed.

The pattern is clear: unit tests verify implementation, not outcome. For a visual product, outcome is everything.

---

## 3. Phased Rollout That Makes Baseline Management Tractable

The "maintenance trap" objection is valid but solvable. Here is a three-phase rollout that keeps baseline management under control.

**Phase 1 -- Zero-Baseline Checks (Week 1-2).** Implement the checks that require no baselines at all: #42 (narration ordering), #45 (resolution check), #46 (audio-video parity), #83 (file-size budget), #37 (overlay leak detector), #21 (hit-test gate), #93 (schema validation). These are pure assertions against known invariants. No baselines to update, no storage to manage, no false positives from rendering differences.

**Phase 2 -- Structural Baselines (Week 3-4).** Add #87 (events.json structural diff) and #55 (frame rate consistency). These use lightweight JSON/numeric baselines that are easy to review and update. Store baselines in `baselines/` tracked in Git (not LFS -- these are small JSON files). A single `npm run update-baselines` script regenerates them. PR review includes a diff of the baseline changes.

**Phase 3 -- Visual Baselines (Week 5-8).** Roll out #2 (step-aligned screenshots), #1 (frame-by-frame MP4 diff), #7 (focus ring regression), #6 (chapter title diffing), #3 (cursor position), and #47 (phantom overlay detection). Use Git LFS for PNG baselines. Set pixelmatch threshold at 0.5% to absorb anti-aliasing and subpixel differences. Run on the 5 pr-tier specs on every PR (#81), full suite nightly. The `update-baselines` script regenerates all baselines with a single command. PR comments include a composite diff image showing before/after/delta for any changed baselines.

**Ongoing baseline hygiene:** Baselines are updated in the same PR that introduces the visual change. If a PR changes a chapter title font size, the baseline update is part of the PR diff. Reviewers see the visual delta. This is not maintenance burden -- it is the visual equivalent of updating a snapshot test, which every modern frontend team already does.

---

## 4. Specific Bugs That ONLY Visual/Video Testing Would Catch

**Bug 1: Phantom highlight on assert (shipped, fixed).** Root cause: `pulseFocus` called during `assert` steps. Current guard: unit test checking `pulseFocus` not called. Vulnerability: any new overlay mechanism bypassing `pulseFocus`. Visual catch: step-aligned screenshot (#2) during assert shows zero visual change; phantom overlay pixel scan (#47) detects `#32dcff` accent color in video frames.

**Bug 2: Cursor teleport during drag-and-drop (shipped, fixed).** Root cause: `moveCursorTo` ran after `dragTo` completed. Current guard: execution order unit test. Vulnerability: cursor interpolation changes, early resolution, or animation timing regression. Visual catch: cursor position validation (#3) confirms cursor within 5px of expected trajectory; drag trajectory sampling (#14) catches mid-path divergence.

**Bug 3: Narration plays after the action it describes (shipped, fixed).** Root cause: overlap prevention in `adjustTiming` pushed `startMs` past `actionTimestamp`. Current guard: unit tests on synthetic segments. Vulnerability: changes to `GAP_MS`, variable TTS durations, or overlap logic refactoring. Visual catch: narration temporal ordering (#42) parses real `events.json` + `subtitles.vtt` and asserts ordering on the rendered artifact.

**Bug 4: Audio drifts from video after trim (shipped, fixed).** Root cause: missing second `-ss` before audio input in ffmpeg args. Current guard: unit test checking args array. Vulnerability: args deduplication, helper function refactoring, or flag reordering. Visual catch: audio-video duration parity (#46) via `ffprobe` detects drift at the output level.

**Bug 5 (latent): `escapeDrawtext` future crash.** The function handles 8 special characters. Any chapter title containing an unhandled ffmpeg format sequence (e.g., `{`, `}`, or Unicode combining characters) will crash the render or produce garbled text. Current guard: none beyond the specific character tests. Visual catch: chapter title card diffing (#6) catches any rendering anomaly, regardless of which character triggered it.

**Bug 6 (latent): Leaked overlay after mid-step error.** If `showSelectOverlay`, `showFilePickerOverlay`, or `pulseFocus` throws or if the step fails mid-animation, the injected DOM elements may not be cleaned up. They render into every subsequent frame. Current guard: none. Visual catch: orphaned overlay leak detector (#37) scans for `dm-*` elements after playback; frame-by-frame diffing (#1) catches unexpected persistent overlays in the rendered video.

---

## Closing Argument

The Pragmatist will tell you that visual tests are expensive, flaky, and hard to maintain. They are right about the cost. They are wrong about the conclusion.

Demo-machine exists to produce polished video artifacts. Every viewer sees the output. A phantom highlight, a teleporting cursor, a narration that plays two seconds late -- these are not edge cases. They are the product experience. The question is not "can we afford visual testing?" The question is "can we afford to ship without it?"

The four bugs we have already fixed prove the point. Each was caught late, each required a Fagan review pass to identify, and each would have been caught immediately by the visual and video QA checks proposed here. The cost of not having these checks is measured in shipped regressions, reviewer hours, and user trust.

Baseline management is the cost of doing business for visual products. Chromatic, Percy, and Applitools have proven this model works at scale. We are not inventing a new paradigm. We are applying a proven paradigm to the exact domain where it matters most: rendered video output.

Build the visual pipeline. Ship with confidence.
