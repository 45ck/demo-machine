# Share Viewer

Demo Machine can turn a completed run into a polished static viewing page with
native video controls, chapter navigation, captions, a readable transcript,
keyboard shortcuts, timestamp deep links, playback speed, and explicit calls to
action. The transcript is timestamped, searchable, and copyable. The viewer
stays local-first: it contains no analytics, cookies, remote scripts, remote
fonts, or tracking pixels.

## Configure The Viewer

Add `share` to the demo spec. The full example is in
[`share-viewer.example.demo.yaml`](share-viewer.example.demo.yaml).

```yaml
share:
  title: "A review-ready workflow"
  summary: "Follow the workflow from intake to a traceable handover."
  profile:
    label: "Aged Care"
    syntheticBoundary: "Synthetic demonstration data only. Not for clinical use."
  brand:
    name: "Example Health"
    primary: "#57d6b0"
    background: "#101723"
  primaryCta:
    label: "Test it yourself"
    url: "https://demo.example.com"
  secondaryCta:
    label: "Book a call"
    url: "/contact"
  poster: "poster.png"
  disclaimer: "Synthetic demonstration data only."
  noindex: true
  publicSafe: true
  embedMode: "deny"
```

`title` is optional and falls back to `meta.title`. The summary, profile label,
synthetic-boundary statement, primary call to action, and its label are
required. The profile and boundary remain visible beside the player rather than
being hidden in a modal. A secondary call to action is optional. Calls to action
may use HTTPS, loopback HTTP for local development, or safe same-origin paths
beginning with `/` or `./`. Unsafe schemes, protocol-relative URLs, path
traversal, oversized copy, and nested media paths fail validation.

Viewer media is deliberately constrained to sibling files. Defaults are
`output.mp4` and `subtitles.vtt`; an optional poster may be PNG, JPEG, WebP, or
AVIF. A configured poster must exist. If the VTT file is absent, the generator
creates it deterministically from reviewed step `narration` and captured event
timestamps. This works with `--no-narration`: no TTS provider, audio file,
network service, or model is required. An existing VTT is preserved as the
reviewed source. Steps without narration are omitted; when a spec has neither
reviewed step narration nor an existing VTT, captions and transcript remain
unavailable rather than inventing product copy that has not been reviewed.

## Viewer Interactions

Chapter and transcript timestamp buttons seek the recording and update the
current URL with a `?t=<seconds>` deep link. Opening a URL such as
`viewer.html?t=42.5` seeks to that point after video metadata loads. The Copy
current link control copies the current playback position without sending it
anywhere.

The transcript search is entirely in-browser and Copy transcript uses the
Clipboard API with a local fallback. Playback speed offers 0.75×, 1×, 1.25×,
1.5×, and 2×. No preference or query is persisted to cookies, local storage, or
analytics. When playback ends, an accessible prompt repeats the primary call to
action and offers replay; the primary call to action also stays visible beside
the player throughout playback.

## Generate

A normal `run` writes the viewer automatically after rendering and the
post-render quality gate when `share.enabled` is true:

```bash
demo-machine run product.demo.yaml --output output/product --overwrite
```

For a silent recording with the same accessible transcript surface:

```bash
demo-machine run product.demo.yaml --output output/product --overwrite --no-narration
```

To add or regenerate the viewer beside an existing completed run without
recapturing or rerendering:

```bash
demo-machine share product.demo.yaml output/product
```

The command reads `events.json` and `metadata.json`, probes the rendered video
duration with FFprobe, and writes:

- `viewer.html`: responsive static page with embedded CSS and JavaScript;
- `viewer.manifest.json`: deterministic media hashes, exact duration, calls to
  action, chapter timings, profile boundary, publication/embed flags, required
  response headers, accessibility features, and privacy invariants.

Serve the directory over HTTP so browsers can seek video and load captions:

```bash
npx http-server output/product
```

The viewer itself has a hash-based Content Security Policy and no network
client. Its only runtime resources are the sibling video, poster, and captions.
Every call-to-action link opens with `noopener`, `noreferrer`, and `nofollow`.
`noindex` defaults to true; setting `publicSafe: false` also forces effective
noindex even if `noindex` was disabled.

## Embed Policy

`embedMode` defaults to `deny`. Explicit `same-origin` mode changes only the
framing contract to `frame-ancestors 'self'` plus `X-Frame-Options: SAMEORIGIN`;
it never permits third-party embedding. Browsers do not enforce
`frame-ancestors` from an HTML `<meta>` policy, so the manifest records the exact
`Content-Security-Policy` and `X-Frame-Options` response headers that the static
host must emit. Deny mode records `frame-ancestors 'none'` and
`X-Frame-Options: DENY`. Do not claim the framing boundary is active until the
hosted response is verified against that manifest contract.

## Publication Boundary

The viewer generator validates structure and transport safety; it cannot decide
whether recorded people, customer data, product claims, or credentials are safe
to publish. Review the video, poster, captions, transcript, and manifest before
hosting them. Keep sensitive captures private, use redaction, and do not treat a
generated viewer as publication approval.

The static viewer is hosting-neutral. Copy the complete output directory to an
approved static host or product site only after that host's access, caching,
privacy, legal, response-header, and rollback gates have passed.
