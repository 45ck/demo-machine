# Glossary

- **Spec**: A YAML file defining a demo scenario — metadata, runner config, chapters, and steps.
- **Runner**: A child process (e.g., `pnpm dev`) that serves the target application.
- **Playback**: Executing spec steps against a live browser via Playwright.
- **Capture**: Recording browser video, trace data, and event logs during playback.
- **Event Log**: Timestamped array of actions with bounding boxes and durations.
- **Timeline**: Renderer-agnostic sequence of segments derived from the event log.
- **Renderer**: Component that produces a polished video from timeline + raw capture.
- **Redaction**: Blurring sensitive selectors and scanning for secret patterns.
- **Narration**: Text-to-speech audio generated from spec narration strings.
- **Chapter**: A logical grouping of steps with a title and optional narration.
