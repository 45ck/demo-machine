# Systems Architect Debate Brief: Infrastructure-First Quality Assurance

**Position:** Build the infrastructure layer first, then quality checks compose on top. Without deterministic CI foundations, every visual regression test is a flaky liability, not an asset.

---

## 1. My TOP 12 Picks — Three Layers

### Layer A: Infrastructure (must land first, in this order)

1. **#93 — Spec YAML Schema Validation Fast Check** (Score 4.65). This is the zero-cost gate. Three seconds, pure Zod, zero flakiness. It already half-exists. Every CI pipeline needs a sub-10-second smoke gate that catches the dumbest class of errors before anything expensive runs. This is it.

2. **#81 — Tiered CI Matrix (pr/nightly tiers)** (Score 4.35). This is the single most important architectural decision in the whole list. Without tiering, you either run 27 specs on every PR (40+ minute feedback loops, flaky failures block merges) or you run nothing (regressions land silently). The manifest.json `releaseTier` field already exists. Five critical specs on PR, full suite nightly. Every other idea in this list inherits this decision.

3. **#82 — Sharded Parallel Capture** (Score 4.00). Once you have tiering, the nightly full-suite run must complete in reasonable time. One GitHub Actions matrix job per spec, artifacts collected at the end. Without this, the nightly run takes 2+ hours and nobody looks at the results. Sharding is what makes a 27-spec suite operationally viable.

4. **#86 — Playwright Trace Artifact Upload on Failure** (Score 4.60). When a CI capture fails, the current debugging workflow is "check out the branch, run it locally, hope to reproduce." Trace upload with a link to trace.playwright.dev transforms that into "click link, see exact DOM state at failure." This is low complexity and immediately reduces the cost of every other check that follows.

5. **#94 — Changed-File-Aware Test Selection** (Score 4.15). `vitest run --related` on PR, full suite on push-to-master. This is the difference between a 45-second PR check and a 4-minute one. Developers ignore slow checks. Fast checks change behavior.

### Layer B: Quality (land after infrastructure is stable)

6. **#87 — events.json Structural Diff as PR Check** (Score 4.25). This is the single idea I would fight hardest for. It gives you 80% of visual regression's value at 5% of its maintenance cost. The events.json file is a deterministic artifact: same spec, same app state, same action sequence. Diff it structurally (ignore timestamps, compare action types, selectors, and ordering). When the diff is empty, the demo behaved identically. When it is not empty, something changed in the interaction layer. No baselines to update. No pixel thresholds to tune. No GPU rendering variance. No anti-aliasing debates. Deterministic.

7. **#42 — Narration-Before-Action Temporal Ordering** (Score 4.85). The highest-scored idea in the entire list, and deservedly so. This catches the exact bug class that prompted the `timing.ts` narration cap fix. Parse events.json timestamps against subtitles.vtt cue times. Assert that narration starts before or at the action it describes. Zero false positives because both artifacts are deterministic. This runs as a post-render check on every spec that has narration enabled.

8. **#37 — Orphaned Overlay Leak Detector** (Score 4.20). A post-playback DOM scan for lingering `dm-cursor`, `dm-focus-ring`, `dm-overlay` elements. This catches a real bug class (overlays stacking from rapid step execution) with zero flakiness. It is a DOM query, not a pixel comparison. It runs in milliseconds. It belongs in the capture pipeline itself, not just CI.

9. **#21 — Pre-Click Hit-Test Gate** (Score 4.50). `document.elementFromPoint()` before every click action. When something obscures the target (cookie banner, sticky header, modal backdrop), the hit-test fails with actionable context: what element is actually at those coordinates, its tag, id, class, z-index. This catches real product bugs and real demo bugs. It belongs in the playback engine, running on every capture, not just in CI.

10. **#85 — Flake Quarantine Registry** (Score 3.85). This is the most underrated idea in the entire list. A `flake-registry.json` file that records which specs are quarantined, when, and why. Quarantined specs run but do not block the pipeline. Weekly cron re-tests them. Auto-PR on recovery. Without this, the first flaky nightly failure poisons the entire suite. Engineers start ignoring failures. The quarantine registry is what makes a 27-spec nightly suite operationally sustainable.

### Layer C: Polish (land after quality layer is proving its value)

11. **#45 — Resolution & Aspect Ratio Integrity Check** (Score 4.50). `ffprobe` the output MP4, compare against spec `meta.resolution`. Check SAR=1:1, DAR=16:9. Pure metadata, no decoding, no rendering, no flakiness. Five lines of code, catches resolution inflation and broken ffmpeg filter chains.

12. **#46 — Audio-Video Duration Parity Check** (Score 4.50). `ffprobe` both streams, assert within 100ms. Catches the dual `-ss` trim bug that FIX-1 of the domain Fagan pass 4 fixed. Another pure metadata check with zero false positive risk.

---

## 2. Why Build Order Matters More Than Selection

The Pragmatist and Maximalist will spend their time arguing about which checks to include. I am arguing that the dependency graph between checks determines success or failure more than the checks themselves.

Here is the dependency graph:

```
#93 (schema validation)          -- no dependencies, gate 0
  |
  v
#94 (vitest --related)           -- needs CI config only
  |
  v
#81 (tiered matrix)              -- needs manifest.json releaseTier
  |
  v
#82 (sharded capture)            -- needs #81 (tiering defines which specs run where)
  |
  v
#86 (trace upload)               -- needs #82 (shards produce trace artifacts)
  |
  v
#85 (flake quarantine)           -- needs #82 (shards identify which spec flaked)
  |
  +---> #87 (events.json diff)   -- needs #82 (shards produce events.json artifacts)
  |       |
  |       v
  |     #42 (narration ordering) -- needs events.json + subtitles.vtt from capture
  |
  +---> #21 (hit-test gate)      -- independent, goes into playback engine
  +---> #37 (overlay leak)       -- independent, goes into playback engine
  +---> #45 (resolution check)   -- needs output MP4 from capture
  +---> #46 (duration parity)    -- needs output MP4 from capture
```

If you try to add #87 (events.json diff) without #81/#82 (tiering and sharding), you are running structural diffs on 27 specs sequentially on every PR. That is a 30-minute PR check. Nobody will tolerate it. It will be disabled within a week.

If you try to add #2 (step-aligned screenshots) without #85 (flake quarantine), the first GPU rendering difference between your local machine and CI will produce a false positive. The second false positive will train engineers to click "re-run." The third will train them to add `[skip ci]` to their commit messages. You have now made your quality pipeline worse than having no pipeline at all.

Build order is not a nice-to-have. It is the architecture.

---

## 3. What I Adopt and Reject from the Other Positions

### From the Pragmatist (likely champions #93, #83, #45, #46, low-complexity checks)

**Adopt:** The Pragmatist is correct that baseline maintenance is expensive and that metadata checks (#45, #46, #83) deliver disproportionate value per line of code. I include #45 and #46 in my Layer C. The Pragmatist is also correct that #93 belongs first.

**Reject:** The Pragmatist will likely argue against #87 (events.json diff) because it requires baseline management. But events.json baselines are fundamentally different from screenshot baselines. An events.json baseline is a 2KB JSON file with deterministic content. When it changes, the diff is human-readable: "step 4 changed from click to clickFirstVisible." A screenshot baseline is a 200KB PNG that requires visual inspection. The maintenance cost differs by two orders of magnitude. The Pragmatist conflates structural baselines with visual baselines, and that conflation leads to rejecting the most valuable check in the entire list.

### From the Maximalist (likely champions #2, #1, #3, #7, visual regression suite)

**Adopt:** The Maximalist is correct that visual verification is ultimately necessary. You cannot ship a demo video tool that does not verify its visual output. I accept this premise. But I reject their proposed implementation path.

**Reject:** #2 (step-aligned screenshots) and #1 (frame-by-frame MP4 diffing) are the right ideas implemented at the wrong time. They require: (a) a stable CI pipeline that can capture specs reliably (#81, #82), (b) a flake management system that prevents GPU/font rendering differences from poisoning the suite (#85), (c) a baseline storage strategy that does not bloat the repository (#92, which I note scored 2.90 -- the second-lowest score in the entire list). The Maximalist wants to jump to visual regression without building the runway. That airplane crashes on takeoff.

I would also reject #92 (screenshot baseline store with pixelmatch) in its proposed form. Git LFS for screenshot baselines is operationally painful. Baselines should live in a CI artifact store with automatic expiry, not in the repository. This is a lesson the entire frontend testing industry learned between 2020 and 2024.

**What I would adopt later:** Once Layer A and Layer B are stable (roughly 6-8 weeks of operational maturity), I would add #2 (step-aligned screenshots) targeting only the 5 pr-tier specs, with a 0.5% pixelmatch threshold, baselines stored as CI artifacts regenerated weekly, and #85 (flake quarantine) already in place to absorb the inevitable false positives. That is the Maximalist's vision built on the Systems Architect's foundation.

### The ideas I reject entirely

**#34 (Replay Determinism Checker):** Run spec N times, compare event logs. This is a research tool, not a CI check. It belongs in a quarterly engineering review, not a pipeline. Score 3.10 is correct.

**#92 (Screenshot Baseline Store):** Git LFS baselines are an operational tar pit. Score 2.90 is generous.

**#98 (Gallery Regeneration Diff as PR Comment):** High complexity, requires rendering GIFs on CI, and the gallery is a derivative artifact. Check the source (events.json, video metadata), not the derivative.

---

## 4. Proposed Architecture: What Runs Where

### On Every PR (target: < 90 seconds)

| Check                                        | Source   |
| -------------------------------------------- | -------- |
| Spec YAML schema validation (all 27)         | #93      |
| `vitest run --related` (changed files only)  | #94      |
| Lint + format + cspell (existing pre-commit) | existing |
| Dependency-cruiser (existing pre-push)       | existing |

No captures. No rendering. No video. Pure static analysis and unit tests. Fast, deterministic, impossible to flake.

### On PR When `src/playback/` or `examples/` Changed (target: < 8 minutes)

| Check                                               | Source   |
| --------------------------------------------------- | -------- |
| Capture 5 pr-tier specs (sharded, 1 per matrix job) | #81, #82 |
| events.json structural diff against main baseline   | #87      |
| Hit-test gate (runs during capture)                 | #21      |
| Overlay leak detection (runs during capture)        | #37      |
| Resolution + aspect ratio check on output MP4       | #45      |
| Audio-video duration parity                         | #46      |
| Upload Playwright traces on failure                 | #86      |

This is the critical tier. Five specs, sharded across five parallel jobs, each completing in under 90 seconds. The structural diff, metadata checks, and engine-level guards (hit-test, overlay leak) all run within those jobs. No pixel comparison. No baselines that drift. Every failure is actionable.

### Nightly (target: < 25 minutes, with sharding)

| Check                                            | Source                  |
| ------------------------------------------------ | ----------------------- |
| Full 27-spec capture (sharded, 27 parallel jobs) | #82                     |
| Everything from the PR tier, on all 27 specs     | #87, #21, #37, #45, #46 |
| Narration temporal ordering (all narrated specs) | #42                     |
| Flake quarantine evaluation                      | #85                     |
| File-size budget gate                            | #83                     |
| Capture duration histogram                       | #84                     |

The nightly run is where the full suite lives. Flake quarantine ensures that a single flaky spec does not cause the team to ignore the entire run. The narration ordering check runs here because it requires rendered output with audio, which is too expensive for PR.

### Weekly (target: informational, non-blocking)

| Check                                            | Source   |
| ------------------------------------------------ | -------- |
| Flake quarantine re-test (recovery detection)    | #85      |
| Accessibility audit (ARIA roles, missing labels) | #61, #64 |
| Full vitest suite timing budget                  | #97      |

The weekly cadence is for checks that inform but do not block. Accessibility checks (#61, #64) catch product bugs in the example apps, not demo-machine bugs. They are valuable but orthogonal to the release pipeline. They run weekly, results posted to a dashboard, teams notified of regressions.

---

## The Core Argument

Every quality assurance system fails the same way: it starts with enthusiasm, accumulates checks faster than it accumulates operational maturity, hits a flake rate that makes engineers distrust results, and gets disabled or ignored. The ideas in this list are overwhelmingly good. The danger is not picking the wrong ones. The danger is picking the right ones in the wrong order.

Infrastructure first. Deterministic checks second. Visual checks third, on top of a foundation that can absorb their inherent non-determinism. That is the build order. That is the architecture.
