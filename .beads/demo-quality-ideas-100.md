# Demo Quality Assurance: 100 Ideas from 5 Expert Domains

Generated 2026-03-23 by 5 specialist agents. Scored against unified criteria below.

---

## Evaluation Criteria (Weighted)

| Criterion           | Weight | Description                                                                        |
| ------------------- | ------ | ---------------------------------------------------------------------------------- |
| **Impact**          | 30%    | How directly does this catch real regressions that affect the viewer's experience? |
| **Feasibility**     | 25%    | How easy to implement given our stack (Playwright, pixelmatch, ffprobe, vitest)?   |
| **Signal-to-Noise** | 20%    | Actionable results vs false positives?                                             |
| **Automation**      | 15%    | Can it run fully unattended in CI?                                                 |
| **Coverage**        | 10%    | How many spec types / failure modes does it cover?                                 |

Score range: 1-5 per criterion. Weighted total max = 5.00.

---

## Master Ranking (All 100 Ideas)

### TIER 1 — Quick Wins & High-Impact (Score >= 4.2) — Implement First

| Rank | ID  | Title                                       | Domain     | Cmplx | Score | Why It Matters                                                                                                                                         |
| ---- | --- | ------------------------------------------- | ---------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | 42  | Narration-Before-Action Temporal Ordering   | Video QA   | Low   | 4.85  | Catches the exact narration-after-action bug class. Parse events.json + subtitles.vtt, assert narrationStart <= actionTimestamp. Zero false positives. |
| 2    | 93  | Spec YAML Schema Validation Fast Check      | CI/CD      | Low   | 4.65  | 3-second Zod validation of all 27 specs. First CI gate, catches typos/schema errors instantly. Already partially exists.                               |
| 3    | 86  | Playwright Trace Artifact Upload on Failure | CI/CD      | Low   | 4.60  | Upload trace.zip as CI artifact + link to trace.playwright.dev. Transforms CI debugging from "re-run locally" to "click link, see state."              |
| 4    | 2   | Step-Aligned Screenshot Snapshots           | Visual Reg | Med   | 4.50  | Screenshot at each step boundary, diff against baselines with pixelmatch. THE core chromatic-style test.                                               |
| 5    | 45  | Resolution & Aspect Ratio Integrity Check   | Video QA   | Low   | 4.50  | ffprobe output dimensions vs spec meta.resolution. SAR=1:1, DAR=16:9. Pure metadata, no false positives.                                               |
| 6    | 46  | Audio-Video Duration Parity Check           | Video QA   | Low   | 4.50  | ffprobe both streams, assert within 100ms. Catches the dual -ss trim bug.                                                                              |
| 7    | 21  | Pre-Click Hit-Test Gate                     | E2E Auto   | Med   | 4.50  | elementFromPoint() before every click. Catches buttons behind cookie banners, modals, sticky headers.                                                  |
| 8    | 83  | Output Video File-Size Budget Gate          | CI/CD      | Low   | 4.40  | stat() output MP4 against per-spec budget in manifest.json. Catches resolution inflation, broken compression.                                          |
| 9    | 81  | Tiered CI Matrix (pr/nightly tiers)         | CI/CD      | Med   | 4.35  | 5 critical specs on PR, full 27 nightly. Uses existing releaseTier in manifest.json.                                                                   |
| 10   | 26  | Pointer-Events-None Detector                | E2E Auto   | Low   | 4.30  | getComputedStyle check before interactive actions. Catches disabled-looking buttons Playwright silently force-clicks.                                  |
| 11   | 30  | Invisible Text Content Assertion            | E2E Auto   | Low   | 4.30  | inputValue() readback after type. Catches input masks, maxlength truncation, controlled component overwrites.                                          |
| 12   | 87  | events.json Structural Diff as PR Check     | CI/CD      | Med   | 4.25  | Diff action sequence against master baseline. Catches behavioral regressions where spec "passes" but interactions changed.                             |
| 13   | 37  | Orphaned Overlay Leak Detector              | E2E Auto   | Med   | 4.20  | Post-playback DOM scan for lingering dm-cursor, dm-focus-ring, etc. Catches visual artifacts in rendered video.                                        |

### TIER 2 — High Value, Moderate Effort (Score 3.8 - 4.19)

| Rank | ID  | Title                                                | Domain     | Cmplx | Score |
| ---- | --- | ---------------------------------------------------- | ---------- | ----- | ----- |
| 14   | 94  | Changed-File-Aware Test Selection (vitest --related) | CI/CD      | Low   | 4.15  |
| 15   | 55  | Frame Rate Consistency & Drop Detection              | Video QA   | Med   | 4.10  |
| 16   | 1   | Frame-by-Frame Baseline Diffing of MP4s              | Visual Reg | Med   | 4.10  |
| 17   | 58  | Video Container & Codec Compliance Check             | Video QA   | Low   | 4.05  |
| 18   | 53  | Intro/Outro Duration Compliance Check                | Video QA   | Low   | 4.00  |
| 19   | 82  | Sharded Parallel Capture (GH Actions Matrix)         | CI/CD      | Med   | 4.00  |
| 20   | 3   | Cursor Overlay Position Validation                   | Visual Reg | Med   | 3.95  |
| 21   | 6   | Chapter Title Card Diffing                           | Visual Reg | Med   | 3.95  |
| 22   | 25  | Action Duration Anomaly Detector                     | E2E Auto   | Med   | 3.95  |
| 23   | 7   | Focus Ring & Pulse Effect Regression                 | Visual Reg | Med   | 3.90  |
| 24   | 47  | Phantom Overlay Detection for Assert Steps           | Video QA   | Med   | 3.90  |
| 25   | 48  | File Size Regression Guard                           | Video QA   | Low   | 3.90  |
| 26   | 28  | Consecutive Action Conflict Detector                 | E2E Auto   | Med   | 3.90  |
| 27   | 84  | Capture Duration Histogram & Perf Gate               | CI/CD      | Med   | 3.85  |
| 28   | 85  | Flake Quarantine Registry                            | CI/CD      | Med   | 3.85  |
| 29   | 64  | Missing Label Detection for Interactive Elements     | A11y/UX    | Med   | 3.85  |
| 30   | 4   | Dropdown/Select Overlay Visual Snapshot              | Visual Reg | Low   | 3.80  |
| 31   | 5   | File Picker Overlay Rendering Check                  | Visual Reg | Low   | 3.80  |
| 32   | 35  | Actionability Attribute Validator                    | E2E Auto   | Low   | 3.80  |
| 33   | 61  | ARIA Role Consistency Audit After Each Step          | A11y/UX    | Med   | 3.80  |
| 34   | 52  | Overlay Z-Index Stacking Verification                | Video QA   | Med   | 3.80  |

### TIER 3 — Solid Ideas, Higher Effort (Score 3.5 - 3.79)

| Rank | ID  | Title                                            | Domain     | Cmplx | Score |
| ---- | --- | ------------------------------------------------ | ---------- | ----- | ----- |
| 35   | 36  | Scroll Position Verification                     | E2E Auto   | Low   | 3.75  |
| 36   | 22  | Stale Bounding Box Guard                         | E2E Auto   | Med   | 3.75  |
| 37   | 29  | Element Stability Wait                           | E2E Auto   | Med   | 3.75  |
| 38   | 9   | Hover State Visual Capture                       | Visual Reg | Med   | 3.70  |
| 39   | 10  | Modal & Popover Z-Index Layer Testing            | Visual Reg | Med   | 3.70  |
| 40   | 11  | Skeleton-to-Content Transition Diffing           | Visual Reg | Med   | 3.70  |
| 41   | 44  | Drawtext Overlay Readability Verification        | Video QA   | Med   | 3.70  |
| 42   | 51  | Dead Time Speed-Up Smoothness Check              | Video QA   | Med   | 3.65  |
| 43   | 57  | Select Overlay Toast Positioning Check           | Video QA   | Med   | 3.65  |
| 44   | 56  | Key Badge Visibility During Press Actions        | Video QA   | Med   | 3.65  |
| 45   | 54  | Drawtext Fade-In/Fade-Out Alpha Curve            | Video QA   | Med   | 3.60  |
| 46   | 71  | Semantic HTML Validation for Form Steps          | A11y/UX    | Low   | 3.60  |
| 47   | 72  | Heading Hierarchy Validator                      | A11y/UX    | Low   | 3.60  |
| 48   | 75  | Image and Icon Accessible Name Check             | A11y/UX    | Low   | 3.60  |
| 49   | 70  | Touch Target Size Validation                     | A11y/UX    | Low   | 3.55  |
| 50   | 69  | Tooltip-Trigger Association Validator            | A11y/UX    | Low   | 3.55  |
| 51   | 77  | Spec-Level Selector Accessibility Lint           | A11y/UX    | Med   | 3.55  |
| 52   | 80  | ARIA Attribute Validity & Spelling Checker       | A11y/UX    | Med   | 3.55  |
| 53   | 88  | Node.js Version Matrix CI                        | CI/CD      | Low   | 3.55  |
| 54   | 89  | pnpm + Playwright Browser Cache                  | CI/CD      | Low   | 3.55  |
| 55   | 90  | Dependency-Cruiser Visualization Artifact        | CI/CD      | Low   | 3.55  |
| 56   | 96  | Capture Artifact Integrity Attestation (SHA-256) | CI/CD      | Low   | 3.55  |
| 57   | 97  | Pre-push Hook Performance Budget                 | CI/CD      | Low   | 3.55  |
| 58   | 100 | Consolidated CI Dashboard (quality-verify.mjs)   | CI/CD      | Low   | 3.55  |
| 59   | 59  | File Picker Overlay Temporal Verification        | Video QA   | Med   | 3.50  |
| 60   | 31  | Network Idle Before Action Gate                  | E2E Auto   | Low   | 3.50  |
| 61   | 76  | Accordion/Disclosure Widget State Tracking       | A11y/UX    | Med   | 3.50  |
| 62   | 67  | Color Contrast Check on Screenshots              | A11y/UX    | Med   | 3.50  |
| 63   | 78  | Skip-Link and Landmark Verification              | A11y/UX    | Low   | 3.50  |

### TIER 4 — Specialized / High Complexity (Score < 3.5)

| Rank | ID  | Title                                         | Domain     | Cmplx | Score |
| ---- | --- | --------------------------------------------- | ---------- | ----- | ----- |
| 64   | 8   | Viewport Resolution Consistency Check         | Visual Reg | High  | 3.45  |
| 65   | 12  | Redaction Overlay Pixel Verification          | Visual Reg | High  | 3.45  |
| 66   | 15  | Anti-Aliasing Subpixel Rendering Tolerance    | Visual Reg | Med   | 3.45  |
| 67   | 16  | Scroll Position Visual Anchoring              | Visual Reg | Med   | 3.40  |
| 68   | 17  | Dark Mode / Theme Toggle Regression           | Visual Reg | Med   | 3.40  |
| 69   | 18  | GIF Gallery Perceptual Hash Comparison        | Visual Reg | Med   | 3.40  |
| 70   | 33  | Hover Menu Persistence Checker                | E2E Auto   | High  | 3.40  |
| 71   | 38  | Tab Order Traversal Validator                 | E2E Auto   | Med   | 3.35  |
| 72   | 39  | Multi-Point Hit-Test for Large Elements       | E2E Auto   | Med   | 3.35  |
| 73   | 41  | Black Frame Detection at Boundaries           | Video QA   | Med   | 3.35  |
| 74   | 50  | Click Ripple Visual Verification              | Video QA   | High  | 3.30  |
| 75   | 65  | Focus Indicator Visibility After Actions      | A11y/UX    | Med   | 3.30  |
| 76   | 68  | ARIA Live Region Announcement Tracking        | A11y/UX    | Med   | 3.30  |
| 77   | 79  | Dynamic Content Focus After Async Waits       | A11y/UX    | Med   | 3.30  |
| 78   | 91  | Mutation Testing Gate on Core Modules         | CI/CD      | Med   | 3.30  |
| 79   | 95  | OS Matrix Windows + Linux Capture Parity      | CI/CD      | Med   | 3.30  |
| 80   | 98  | Gallery Regeneration Diff as PR Comment       | CI/CD      | High  | 3.25  |
| 81   | 99  | CI Canary Spec with Intentional Failure Modes | CI/CD      | Med   | 3.25  |
| 82   | 20  | Cross-Step Layout Stability Score (CLS)       | Visual Reg | High  | 3.20  |
| 83   | 13  | Narration Waveform Alignment Verification     | Visual Reg | High  | 3.20  |
| 84   | 14  | Drag-and-Drop Visual Trajectory Sampling      | Visual Reg | High  | 3.20  |
| 85   | 19  | Typing Animation Character-by-Character       | Visual Reg | High  | 3.15  |
| 86   | 23  | Focus Trap Escape Validator                   | E2E Auto   | High  | 3.15  |
| 87   | 24  | Dropdown/Menu Lifecycle Tracker               | E2E Auto   | High  | 3.15  |
| 88   | 32  | Cross-Step Element Identity Tracker           | E2E Auto   | High  | 3.10  |
| 89   | 34  | Replay Determinism Checker                    | E2E Auto   | High  | 3.10  |
| 90   | 40  | DragAndDrop Path Collision Detector           | E2E Auto   | High  | 3.10  |
| 91   | 43  | Cursor Continuity & Teleportation Detection   | Video QA   | High  | 3.05  |
| 92   | 49  | Subtitle-Audio Alignment Verification         | Video QA   | High  | 3.05  |
| 93   | 60  | Drag Animation Concurrency Verification       | Video QA   | High  | 3.05  |
| 94   | 62  | Focus Trap Verification for Modal Dialogs     | A11y/UX    | High  | 3.00  |
| 95   | 63  | Keyboard-Navigable Dropdown Assertion         | A11y/UX    | High  | 3.00  |
| 96   | 66  | Tab Order Sequence Validation                 | A11y/UX    | High  | 2.95  |
| 97   | 73  | Focus Return After Modal Dismissal            | A11y/UX    | High  | 2.95  |
| 98   | 74  | Combobox Pattern Compliance Check             | A11y/UX    | High  | 2.90  |
| 99   | 92  | Screenshot Baseline Store with pixelmatch     | CI/CD      | High  | 2.90  |
| 100  | 27  | Viewport Overflow Clipping Check              | E2E Auto   | Med   | 2.85  |

---

## Idea Details by Domain

### Domain 1: Visual Regression (Ideas 1-20)

**1. Frame-by-Frame Baseline Diffing of Rendered MP4s** [Medium]
Extract frames from MP4 at fixed intervals, diff against stored baselines using pixelmatch. Catches content regressions, encoding artifacts, overlay rendering changes.

**2. Step-Aligned Screenshot Snapshots** [Medium]
Full-page screenshot at each step boundary during playback. Named by spec + step index + action type. Catches CSS regressions, layout shifts, wrong-page navigations.

**3. Cursor Overlay Position Validation** [Medium]
Validate cursor position against target element bounding box at click/drag/hover moments. 5px tolerance. Catches cursor desync bugs.

**4. Dropdown/Select Overlay Visual Snapshot** [Low]
Screenshot the "Selected: {option}" toast overlay. Verify position, text, opacity, timing within 1300ms window.

**5. File Picker Overlay Rendering Check** [Low]
Screenshot the centered file picker panel. Verify centering, filename text, emoji rendering. Test single and multi-file.

**6. Chapter Title Card Diffing** [Medium]
Extract first frame of each chapter. Diff text positioning, font size, background opacity. Catches escapeDrawtext failures.

**7. Focus Ring and Pulse Effect Regression Testing** [Medium]
Screenshot at pulseFocus moment. Simultaneously verify assert steps produce zero visual effects (the "phantom highlight" guard).

**8. Viewport Resolution Consistency Check** [High]
Run same spec at 1920x1080 and 1280x720. Compare layout landmarks with structural similarity. Catches the gallery resolution bug.

**9. Hover State Visual Capture** [Medium]
Before/after hover screenshots. Store the "hover delta" diff as baseline. Catches removed :hover rules, tooltip z-index issues.

**10. Modal and Popover Z-Index Layer Testing** [Medium]
Pixel sampling at overlay regions to confirm backdrop dimming and correct stacking order. Catches z-index wars.

**11. Skeleton-to-Content Transition Diffing** [Medium]
Screenshots during skeleton and loaded states. Verify they are visually distinct (minimum diff threshold). Catches timing window issues.

**12. Redaction Overlay Pixel Verification** [High]
Sample pixels in redaction bounding boxes. Verify uniformly obscured (near-zero variance). Catches partial redaction leaks.

**13. Narration Waveform Alignment Verification** [High]
Audio waveform active regions vs narration segment timing. Catches audio desync and timing cap regressions.

**14. Drag-and-Drop Visual Trajectory Sampling** [High]
Sample screenshots at 3-5 points along drag path. Verify dragged element attached to cursor. Catches concurrent animation regressions.

**15. Anti-Aliasing and Subpixel Rendering Tolerance** [Medium]
Two-pass pixelmatch: strict for layout, lenient for text regions. Reduces false positives from GPU/font rendering differences.

**16. Scroll Position Visual Anchoring** [Medium]
Before/after scroll screenshots. Verify landmark elements moved by expected pixel distance. Catches the scroll {x,y} bug.

**17. Dark Mode / Theme Toggle Visual Regression** [Medium]
Run same spec in light and dark mode via preSteps localStorage. Separate baseline sets. Catches theme-specific regressions.

**18. GIF Gallery Perceptual Hash Comparison** [Medium]
pHash per frame with Hamming distance comparison. More resilient than pixel-exact for GIF's lossy encoding.

**19. Typing Animation Character-by-Character Snapshot** [High]
Screenshot after each character typed. Verify input content, cursor position, text alignment against baselines.

**20. Cross-Step Layout Stability Score (CLS)** [High]
Compute CLS across consecutive steps. Detect unintended layout shifts from modal opens, font loading, overlay injection.

### Domain 2: Browser Automation & E2E (Ideas 21-40)

**21. Pre-Click Hit-Test Gate** [Medium]
document.elementFromPoint() before every click. Log the obscuring element's tag, id, class, z-index on failure.

**22. Stale Bounding Box Guard** [Medium]
Re-query bounding box after initial read, before action dispatch. Detect layout reflow between read and click.

**23. Focus Trap Escape Validator** [High]
Verify next step's target is inside modal (if modal still open) or modal is dismissed. Catches behind-backdrop interactions.

**24. Dropdown/Menu Lifecycle Tracker** [High]
MutationObserver for role="listbox/menu/combobox" + aria-expanded. Track open->select->close lifecycle. Catch invisible dropdowns.

**25. Action Duration Anomaly Detector** [Medium]
Compare step duration against rolling average. Flag >2 std dev outliers. Store history in timing-history.json sidecar.

**26. Pointer-Events-None Detector** [Low]
getComputedStyle check for pointer-events: none before interactive actions. Catches deceptive disabled buttons.

**27. Viewport Overflow Clipping Check** [Medium]
Verify target bounding box is fully within viewport. Check for overflow:hidden ancestors clipping the element.

**28. Consecutive Action Conflict Detector** [Medium]
Static analysis of step sequence for logical conflicts: navigate-then-type-on-old-page, check-then-uncheck without assertion.

**29. Element Stability Wait** [Medium]
Poll bounding box 3x at 50ms intervals. Wait until position stabilizes. Prevents clicks during CSS transitions.

**30. Invisible Text Content Assertion** [Low]
locator.inputValue() readback after type. Compare against expected step.text. Catches input masks, maxlength, controlled components.

**31. Network Idle Before Action Gate** [Low]
Optional per-step waitForNetworkIdle before interactive actions. Catches layout reflow from late-loading sibling content.

**32. Cross-Step Element Identity Tracker** [High]
Inject data-dm-id on first resolution. Verify same DOM node across steps targeting same selector. Catches SPA re-mount issues.

**33. Hover Menu Persistence Checker** [High]
Verify hover-revealed content still visible when next step begins. Catches aggressive mouseleave handlers.

**34. Replay Determinism Checker** [High]
Run spec N times, compare event logs. Compute determinism score 0-100%. Identify flake-prone steps.

**35. Actionability Attribute Validator** [Low]
Verify target has correct HTML semantics for action type (button for click, input for type, etc.). Warning-level.

**36. Scroll Position Verification** [Low]
Read actual scrollX/Y after scroll step. Compare against requested delta. Catches overflow:hidden blocking scrolls.

**37. Orphaned Overlay Leak Detector** [Medium]
Post-playback DOM scan for visible dm-\* overlay elements. Catches stacked overlays from rapid step execution.

**38. Tab Order Traversal Validator** [Medium]
Verify demo step order follows natural tab order. Check press Tab actually moves focus correctly.

**39. Multi-Point Hit-Test for Large Elements** [Medium]
9-point hit test (center + corners + midpoints). Report percentage unobscured. Catches partial overlay coverage.

**40. DragAndDrop Path Collision Detector** [High]
Sample points along drag path for z-index barriers. Verify draggable attribute on source. Catches cross-overlay drag failures.

### Domain 3: Video & Media QA (Ideas 41-60)

**41. Black Frame Detection at Segment Boundaries** [Medium]
ffmpeg blackdetect at segment transitions. Catches black gaps from filter_complex chaining.

**42. Narration-Before-Action Temporal Ordering** [Low]
Assert narrationStartMs <= actionTimestampMs for every segment. Parse events.json + subtitles.vtt.

**43. Cursor Continuity and Teleportation Detection** [High]
Track cursor position at 60fps. Flag frame-to-frame jumps > 15% viewport diagonal. Catches recording frame drops.

**44. Drawtext Overlay Readability Verification** [Medium]
OCR or contrast analysis on chapter title frames. Verify WCAG AA contrast against background.

**45. Resolution and Aspect Ratio Integrity Check** [Low]
ffprobe width/height/SAR/DAR against spec resolution. Pure metadata check.

**46. Audio-Video Duration Parity Check** [Low]
ffprobe both streams, assert within 100ms. Catches dual -ss trim bug and tpad miscalculation.

**47. Focus Ring and Spotlight Phantom Overlay Detection** [Medium]
Pixel diff during assert steps for #32dcff accent color. Verify zero cursor movement. Catches assert visual effect regression.

**48. File Size Regression Guard** [Low]
Baseline file sizes per spec in JSON manifest. Flag dramatic shrink (truncation) or growth (bloat).

**49. Subtitle-Audio Alignment Verification** [High]
RMS energy analysis of audio at VTT cue windows. Verify speech present during cue, absent outside. Catches adelay rounding.

**50. Click Ripple Visual Verification** [High]
Extract frames during 420ms ripple animation. Detect expanding concentric rings at click coordinates.

**51. Dead Time Speed-Up Smoothness Check** [Medium]
SSIM analysis of sped-up segments. Verify smooth fast-forward vs frame decimation.

**52. Overlay Z-Index Stacking Verification** [Medium]
Extract frames when multiple overlays visible. Verify correct stacking order against z-index values.

**53. Intro/Outro Duration Compliance Check** [Low]
ffprobe + frame extraction. Verify 2s intro and 2s outro render correctly. Check trimStartMs doesn't clip them.

**54. Drawtext Fade-In/Fade-Out Alpha Curve Verification** [Medium]
Sample frames during 0.3s fade. Measure luminance curve. Catches malformed alpha expressions from escapeDrawtext.

**55. Frame Rate Consistency and Drop Detection** [Medium]
ffprobe -show_frames PTS analysis. Flag inter-frame intervals deviating >50% from median.

**56. Key Badge Visibility During Press Actions** [Medium]
Extract frames during 900ms KEY_BADGE_DURATION_MS. Verify badge at bottom-center with correct label text.

**57. Select Overlay Toast Positioning and Content Check** [Medium]
Extract frames during 1200ms window. Verify "Selected: {option}" toast at bottom-center with correct styling.

**58. Video Container and Codec Compliance Check** [Low]
ffprobe codec=H.264, container=MP4, pixel_format=yuv420p, profile=High. Catches Safari/iOS compatibility issues.

**59. File Picker Overlay Concurrent with Upload Action** [Medium]
Verify overlay renders for 1300ms BEFORE setInputFiles. Cross-reference event log timestamps.

**60. Drag Animation Concurrency Verification** [High]
Track cursor and dragged element at 30fps. Verify concurrent arrival within 200ms. Catches Promise.all regression.

### Domain 4: Accessibility & UX (Ideas 61-80)

**61. ARIA Role Consistency Audit After Each Step** [Medium]
Post-step DOM audit for required ARIA properties on role'd elements. Implemented as ChangeDetector.

**62. Focus Trap Verification for Modal Dialogs** [High]
Tab/Shift+Tab cycling verification inside role="dialog". Verify focus containment.

**63. Keyboard-Navigable Dropdown Assertion** [High]
ArrowDown/Up verification on role="listbox/menu/combobox". Check aria-activedescendant movement.

**64. Missing Label Detection for Interactive Elements** [Medium]
Scan all interactive elements for accessible name via aria-label, aria-labelledby, label association, title, or text content.

**65. Focus Indicator Visibility After Click/Type Steps** [Medium]
Check computed outline/box-shadow/border styles on document.activeElement for visible focus indicator.

**66. Tab Order Sequence Validation** [High]
Programmatic Tab walk. Compare focus sequence against visual reading order. Flag tabindex jumps.

**67. Color Contrast Check on Screenshot Captures** [Medium]
WCAG AA contrast ratio on text elements. Computed color vs background-color. 4.5:1 normal, 3:1 large text.

**68. ARIA Live Region Announcement Tracking** [Medium]
MutationObserver on aria-live/role="alert"/role="status". Report what screen readers would announce per step.

**69. Tooltip-Trigger Association Validator** [Low]
After hover, check role="tooltip" elements for aria-describedby/labelledby association with trigger.

**70. Touch Target Size Validation** [Low]
Measure interactive element bounding boxes. Flag < 44x44px (AAA) or < 24x24px (AA).

**71. Semantic HTML Validation for Form Steps** [Low]
Verify type targets input/textarea/contenteditable, check targets checkbox, select targets select/listbox.

**72. Heading Hierarchy Validator** [Low]
Scan h1-h6 for skipped levels, multiple h1s, document order vs visual hierarchy.

**73. Focus Return After Modal/Popover Dismissal** [High]
Track pre-open focus. After dismiss, verify focus returns to trigger or logical ancestor.

**74. Combobox Pattern Compliance Check** [High]
Full ARIA combobox pattern: aria-expanded, aria-controls pointing to listbox, aria-activedescendant to valid option.

**75. Image and Icon Accessible Name Check** [Low]
Scan img/role="img"/svg for alt/aria-label/aria-labelledby. Flag icon-only buttons with no accessible name.

**76. Accordion/Disclosure Widget State Tracking** [Medium]
Track aria-expanded groups. Verify controlled panel visibility matches state. Check exclusive vs multi-select.

**77. Spec-Level Selector Accessibility Lint** [Medium]
Warn when CSS selectors target elements that have accessible role/label alternatives. Suggest role/label-based targets.

**78. Skip-Link and Landmark Verification** [Low]
After navigate, verify main/nav landmarks exist. Check for skip-to-content link as first focusable element.

**79. Dynamic Content Focus Management After Async Waits** [Medium]
After wait+assert sequences, verify new content receives focus or is announced via live region.

**80. ARIA Attribute Validity and Spelling Checker** [Medium]
Validate aria-\* attributes against WAI-ARIA 1.2 spec. Reject typos (aria-lable), invalid values (aria-hidden="yes").

### Domain 5: CI/CD & Infrastructure (Ideas 81-100)

**81. Tiered CI Matrix from manifest.json releaseTier** [Medium]
5 pr-tier specs on every PR, full suite nightly. Reads releaseTier from manifest.json.

**82. Sharded Parallel Capture with GitHub Actions Matrix** [Medium]
Dynamic matrix job per spec. Each shard captures one spec. Collect job downloads all artifacts.

**83. Output Video File-Size Budget Gate** [Low]
Per-spec maxOutputBytes in manifest.json. Fail if exceeded by >10%. Trivial stat() check.

**84. Capture Duration Histogram and Performance Regression Gate** [Medium]
timing.json artifact with captureMs/renderMs/narrationMs/totalMs. Compare against checked-in baselines.

**85. Flake Quarantine Registry with Auto-Retry** [Medium]
flake-registry.json with quarantine dates + ticket URLs. Weekly cron re-tests. Auto-PR on recovery.

**86. Playwright Trace Artifact Upload and Diff on Failure** [Low]
Upload trace.zip as artifact. Post PR comment with trace.playwright.dev link. 1-day retention on success.

**87. events.json Structural Diff as PR Check** [Medium]
Download master baseline events.json. Structural diff showing added/removed/reordered actions. Ignore timestamps.

**88. Node.js Version Matrix CI (22 + 24 LTS)** [Low]
Matrix test on Node 22 and 24. Guards against V8 behavioral differences in page.evaluate closures.

**89. pnpm Store + Playwright Browser Cache** [Low]
Cache ~/.cache/ms-playwright keyed on Playwright version. Saves ~200MB download per run.

**90. Dependency-Cruiser Visualization Artifact** [Low]
dot -> SVG artifact. PR comment comparing before/after dependency graph on import changes.

**91. Mutation Testing Gate on Core Modules** [Medium]
Stryker on trim.ts, presteps.ts, step-schema.ts. 80% mutation score threshold. Nightly.

**92. Screenshot Baseline Store with pixelmatch Diff Gate** [High]
Git LFS baselines/, chapter title screenshots, pixelmatch 0.5% threshold, composite diff artifact.

**93. Spec YAML Schema Validation as Standalone Fast Check** [Low]
Zod validation of all 27 specs in <3 seconds. First CI job. paths filter on examples/ and src/spec/.

**94. Changed-File-Aware Test Selection (vitest --related)** [Low]
git diff --name-only | vitest run --related. 5-10x faster feedback for focused changes.

**95. OS Matrix for Windows + Linux Capture Parity** [Medium]
windows-latest runner for pr-tier specs. Catches path separator, ffmpeg escaping, tree-kill differences.

**96. Capture Artifact Integrity Attestation** [Low]
SHA-256 checksums for all 6 artifacts. Verify before downstream consumption. Catches truncated files.

**97. Pre-push Hook Performance Budget (vitest under 30s)** [Low]
Time vitest run, fail if >30s. Store in .vitest-timing.json. Prevents test suite creep.

**98. Gallery Regeneration Diff as PR Comment** [High]
Run demo-gallery.mjs on pr-tier specs. Compare GIF frame count/size against baselines. Side-by-side PR comment.

**99. CI Canary Spec with Intentional Failure Modes** [Medium]
Spec exercising tight timeouts, narrow drop targets, multi-match selectors. Gate real captures behind canary health.

**100. Consolidated CI Dashboard (quality-verify.mjs JSON)** [Low]
quality-verify.mjs --json to GITHUB_STEP_SUMMARY. Track coverage metrics over time.

---

## Summary Statistics

| Domain             | Ideas   | Low Complexity | Medium | High   | Avg Score |
| ------------------ | ------- | -------------- | ------ | ------ | --------- |
| Visual Regression  | 20      | 3              | 12     | 5      | 3.60      |
| Browser Automation | 20      | 5              | 9      | 6      | 3.55      |
| Video & Media QA   | 20      | 6              | 10     | 4      | 3.58      |
| Accessibility & UX | 20      | 7              | 7      | 6      | 3.38      |
| CI/CD & Infra      | 20      | 12             | 6      | 2      | 3.58      |
| **TOTAL**          | **100** | **33**         | **44** | **23** | **3.54**  |
