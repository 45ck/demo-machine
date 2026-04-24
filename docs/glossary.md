# Glossary

- **Spec**: A YAML file defining a demo scenario — metadata, runner config, chapters, and steps.
- **Runner**: A child process (e.g., `pnpm dev`) that serves the target application.
- **Playback**: Executing spec steps against a live browser via Playwright.
- **Capture**: Recording browser video, trace data, and event logs during playback.
- **Event Log**: Timestamped array of actions with bounding boxes and durations.
- **Output Directory**: The run workspace containing capture, render, verification, and diagnostic artifacts.
- **Latest Pointer**: `output/latest.json`, a small manifest pointing to the most recent automatic run directory.
- **Timeline**: Renderer-agnostic sequence of segments derived from the event log.
- **Renderer**: Component that produces a polished video from timeline + raw capture.
- **Verification Manifest**: `verification.json`, the machine-readable proof of capture status, supported surface, and artifact paths.
- **Quality Report**: `quality.json`, the post-render check result written after MP4 rendering.
- **Redaction**: Blurring sensitive selectors and scanning for secret patterns.
- **Narration**: Text-to-speech audio generated from spec narration strings.
- **Chapter**: A logical grouping of steps with a title and optional narration.
