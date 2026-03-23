# Demo Quality Assurance: Final Recommendations

**Date:** 2026-03-23
**Process:** 5 domain experts generated 100 ideas -> ranked against unified criteria -> 3 architects debated -> synthesized below.

---

## The Verdict: Infrastructure-First, Deterministic Checks, Visual Later

All three positions (Pragmatist, Quality Maximalist, Systems Architect) converged on a critical insight: **build order determines success more than idea selection**. The ranked list of 100 ideas identified the right things to build. The debate identified the right order.

### Points of Unanimous Agreement

| ID  | Idea                                      | All 3 Said                                 |
| --- | ----------------------------------------- | ------------------------------------------ |
| 93  | Spec YAML Schema Validation               | "First. No debate."                        |
| 42  | Narration-Before-Action Temporal Ordering | "Highest signal, zero false positives"     |
| 45  | Resolution & Aspect Ratio Check           | "5 lines of ffprobe, catches real bugs"    |
| 46  | Audio-Video Duration Parity               | "Same ffprobe call, catches dual -ss bug"  |
| 86  | Playwright Trace Upload on Failure        | "Transforms debugging from 30min to 30sec" |
| 37  | Orphaned Overlay Leak Detector            | "DOM scan, not pixels. Always actionable." |
| 83  | File-Size Budget Gate                     | "Trivial stat(), catches silent failures"  |

### Points of Productive Disagreement

| Topic                           | Pragmatist             | Maximalist                 | Architect           | **Resolution**                                                 |
| ------------------------------- | ---------------------- | -------------------------- | ------------------- | -------------------------------------------------------------- |
| Step-aligned screenshots (#2)   | Reject (baseline trap) | Essential (core Chromatic) | Later (after infra) | **Phase 3 — after flake quarantine is stable**                 |
| events.json diff (#87)          | Baseline trap          | Supports                   | Critical            | **Adopt — structural baselines are NOT visual baselines**      |
| CI tiering (#81)                | Premature              | Supports                   | Prerequisite        | **Adopt — enables everything else to be practical**            |
| Hit-test gate (#21)             | Defer                  | Essential                  | Adopt               | **Adopt — goes into playback engine, not CI**                  |
| Flake quarantine (#85)          | Not mentioned          | Not prioritized            | Most underrated     | **Adopt — the immune system that keeps the suite trustworthy** |
| Frame-by-frame MP4 diffing (#1) | Hard reject            | Essential                  | Much later          | **Phase 4 / Aspirational — prove need first**                  |

---

## Adopted Plan: 4 Phases

### Phase 1: The Five-Minute Gate (Week 1)

**Goal:** Zero-baseline checks that produce boolean pass/fail. Ship in 5 days.

| Priority | ID  | Check                                      | Where It Runs    | Effort |
| -------- | --- | ------------------------------------------ | ---------------- | ------ |
| P0       | 93  | Spec YAML schema validation (all 27 specs) | Every PR, <3 sec | 2 hrs  |
| P0       | 45  | Resolution/AR integrity (ffprobe)          | Post-capture     | 1 hr   |
| P0       | 46  | Audio-video duration parity (ffprobe)      | Post-capture     | 30 min |
| P0       | 58  | Codec/container compliance (ffprobe)       | Post-capture     | 30 min |
| P0       | 83  | File-size budget gate (stat)               | Post-capture     | 2 hrs  |
| P0       | 86  | Trace upload on CI failure                 | CI workflow      | 2 hrs  |

**Characteristics:** No baselines. No pixel diffing. No thresholds to tune. Every check is binary. Total: ~8 hrs.

### Phase 2: Runtime Guards + CI Infrastructure (Weeks 2-3)

**Goal:** Checks embedded in the playback engine + CI pipeline that makes them practical.

| Priority | ID  | Check                          | Where It Runs                         | Effort |
| -------- | --- | ------------------------------ | ------------------------------------- | ------ |
| P1       | 42  | Narration temporal ordering    | Post-render (parse events.json + VTT) | 3 hrs  |
| P1       | 21  | Pre-click hit-test gate        | In playback engine, every capture     | 4 hrs  |
| P1       | 26  | Pointer-events-none detector   | In playback engine, every capture     | 1 hr   |
| P1       | 30  | Input text readback assertion  | In type handler                       | 2 hrs  |
| P1       | 37  | Orphaned overlay leak detector | Post-playback DOM scan                | 4 hrs  |
| P1       | 81  | Tiered CI matrix (pr/nightly)  | CI workflow + manifest.json           | 4 hrs  |
| P1       | 82  | Sharded parallel capture       | CI workflow (GH Actions matrix)       | 4 hrs  |
| P1       | 94  | vitest --related on PR         | CI workflow                           | 1 hr   |

**Characteristics:** Runtime guards (#21, #26, #30, #37) become part of every capture — not just CI. CI infrastructure (#81, #82, #94) makes everything fast enough to run without blocking developers. Total: ~23 hrs.

### Phase 3: Structural Baselines + Flake Management (Weeks 4-6)

**Goal:** Deterministic baselines that catch behavioral regressions. Flake quarantine to keep suite trustworthy.

| Priority | ID  | Check                                 | Where It Runs                         | Effort |
| -------- | --- | ------------------------------------- | ------------------------------------- | ------ |
| P2       | 87  | events.json structural diff           | PR (5 specs), Nightly (27 specs)      | 8 hrs  |
| P2       | 85  | Flake quarantine registry             | Nightly + weekly cron recovery        | 6 hrs  |
| P2       | 55  | Frame rate consistency (PTS analysis) | Post-render                           | 4 hrs  |
| P2       | 25  | Action duration anomaly detector      | Post-capture, historical comparison   | 6 hrs  |
| P2       | 53  | Intro/outro duration compliance       | Post-render (ffprobe + frame extract) | 2 hrs  |
| P2       | 28  | Consecutive action conflict detector  | Pre-capture static analysis           | 4 hrs  |
| P2       | 84  | Capture duration perf regression gate | Post-capture, vs baselines            | 4 hrs  |

**Characteristics:** Baselines are small JSON/numeric files, not images. Human-readable diffs. Flake quarantine (#85) is the immune system — without it, the suite collapses under its first false positive. Total: ~34 hrs.

### Phase 4: Visual Regression (Weeks 8-12, after operational maturity)

**Goal:** Pixel-level verification of rendered output. Only after Phases 1-3 are stable.

| Priority | ID  | Check                                    | Where It Runs              | Effort |
| -------- | --- | ---------------------------------------- | -------------------------- | ------ |
| P3       | 2   | Step-aligned screenshot snapshots        | PR (5 specs), Nightly (27) | 16 hrs |
| P3       | 7   | Focus ring / assert zero-visual-effect   | PR (5 specs)               | 8 hrs  |
| P3       | 47  | Phantom overlay detection (#32dcff scan) | Nightly                    | 6 hrs  |
| P3       | 3   | Cursor position validation               | Nightly                    | 8 hrs  |
| P3       | 6   | Chapter title card diffing               | Nightly                    | 6 hrs  |

**Prerequisites before starting Phase 4:**

- Flake quarantine (#85) operational for 4+ weeks with <5% quarantine rate
- CI tiering (#81) and sharding (#82) running reliably
- 0.5% pixelmatch threshold validated against 3+ spec runs with zero false positives
- Baselines stored as CI artifacts with weekly regeneration, NOT Git LFS

**Characteristics:** This is where the Maximalist's vision lands — but on the Architect's foundation. Visual baselines only for the 5 pr-tier specs on PR, full suite nightly. Flake quarantine absorbs the inevitable rendering variance.

---

## What We Chose NOT to Do (and Why)

| ID  | Idea                                   | Why Not                                                                                                             |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Frame-by-frame MP4 baseline diffing    | Storage scales with video duration x spec count. Revisit only if #2 proves insufficient.                            |
| 92  | Git LFS screenshot baseline store      | Industry learned this lesson 2020-2024. CI artifact store with expiry instead.                                      |
| 34  | Replay determinism checker (N runs)    | Research tool, not CI check. Quarterly engineering exercise.                                                        |
| 98  | Gallery GIF regeneration diff          | High complexity derivative check. Check the source (#87), not the derivative.                                       |
| 43  | Cursor teleportation detection (60fps) | Computer vision at 60fps is a research project. #3 covers cursor position at key moments.                           |
| 49  | Subtitle-audio RMS alignment           | Audio energy analysis requires DSP tooling beyond our stack. #42 (timestamp ordering) catches 90% of the same bugs. |
| 50  | Click ripple visual verification       | Detecting expanding concentric rings is fragile. #37 (overlay leak) catches the failure case.                       |

---

## CI Architecture Summary

```
Every PR (< 90 seconds):
  [#93] Schema validate all 27 specs
  [#94] vitest --related (changed files only)
  [existing] lint + format + cspell

PR touching playback/examples (< 8 minutes):
  [#81] Capture 5 pr-tier specs (sharded)
    [#21] Hit-test gate (during capture)
    [#26] Pointer-events-none check (during capture)
    [#30] Input text readback (during capture)
    [#37] Overlay leak scan (post-capture)
    [#45] Resolution/AR check (post-render)
    [#46] Duration parity (post-render)
    [#58] Codec compliance (post-render)
    [#83] File-size budget (post-render)
    [#87] events.json diff vs main (post-capture)
    [#86] Trace upload on failure
  Phase 4 additions:
    [#2]  Step screenshots vs baselines
    [#7]  Assert zero-visual-effect check

Nightly (< 25 minutes, sharded):
  [#82] Full 27-spec capture (parallel)
    Everything from PR tier, on all specs
    [#42] Narration temporal ordering
    [#55] Frame rate consistency
    [#53] Intro/outro duration
    [#84] Capture duration vs perf baselines
    [#25] Action duration anomaly detection
  [#85] Flake quarantine evaluation
  Phase 4 additions:
    [#47] Phantom overlay pixel scan
    [#3]  Cursor position validation
    [#6]  Chapter title card diff

Weekly (informational, non-blocking):
  [#85] Flake quarantine re-test (recovery)
  [#61] ARIA role audit
  [#64] Missing label detection
```

---

## Debate Briefs (Reference)

The full debate positions from each expert are preserved:

- `.beads/debate-brief-pragmatist.md` — "Ship minimum viable, YAGNI everything else"
- `.beads/debate-brief-quality-maximalist.md` — "Demos ARE the product, visual quality is non-negotiable"
- `.beads/systems-architect-brief.md` — "Infrastructure first, deterministic checks second, visual third"

The complete 100-idea catalogue with detailed descriptions is in:

- `.beads/demo-quality-ideas-100.md`

---

## Scoreboard: Ideas Adopted by Phase

| Phase             | IDs Adopted                    | Count  | Estimated Total Effort |
| ----------------- | ------------------------------ | ------ | ---------------------- |
| 1                 | 93, 45, 46, 58, 83, 86         | 6      | ~1 week                |
| 2                 | 42, 21, 26, 30, 37, 81, 82, 94 | 8      | ~2 weeks               |
| 3                 | 87, 85, 55, 25, 53, 28, 84     | 7      | ~3 weeks               |
| 4                 | 2, 7, 47, 3, 6                 | 5      | ~3 weeks               |
| **Total adopted** |                                | **26** | **~9 weeks**           |
| Deferred          | 61, 64 (weekly a11y)           | 2      |                        |
| Rejected          | 1, 34, 43, 49, 50, 92, 98      | 7      |                        |
| Backlog           | remaining 65 ideas             | 65     |                        |

---

## Key Principle

> "Every quality assurance system fails the same way: it starts with enthusiasm, accumulates checks faster than it accumulates operational maturity, hits a flake rate that makes engineers distrust results, and gets disabled or ignored. The danger is not picking the wrong ideas. The danger is picking the right ideas in the wrong order."
> — Systems Architect
