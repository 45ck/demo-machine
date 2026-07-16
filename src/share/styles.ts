const STYLE_TEMPLATE = `
:root {
  color-scheme: __SCHEME__;
  --background: __BACKGROUND__;
  --surface: __SURFACE__;
  --surface-strong: __SURFACE_STRONG__;
  --text: __TEXT__;
  --muted: __MUTED__;
  --primary: __PRIMARY__;
  --primary-text: __PRIMARY_TEXT__;
  --border: __BORDER__;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { background: var(--background); color: var(--text); scroll-behavior: smooth; }
body { margin: 0; min-width: 280px; background: var(--background); }
a { color: inherit; }
button, a { -webkit-tap-highlight-color: transparent; }
.skip-link { position: fixed; z-index: 10; top: .75rem; left: .75rem; transform: translateY(-160%); padding: .7rem 1rem; border-radius: .65rem; background: var(--primary); color: var(--primary-text); }
.skip-link:focus { transform: translateY(0); }
.shell { width: min(1180px, calc(100% - 2rem)); margin: 0 auto; padding: clamp(1.25rem, 4vw, 3.5rem) 0 4rem; }
.eyebrow { margin: 0 0 .8rem; color: var(--primary); font-size: .78rem; font-weight: 760; letter-spacing: .12em; text-transform: uppercase; }
h1 { max-width: 18ch; margin: 0; font-size: clamp(2rem, 5.8vw, 4.75rem); line-height: .98; letter-spacing: -.045em; text-wrap: balance; }
.summary { max-width: 68ch; margin: 1.2rem 0 0; color: var(--muted); font-size: clamp(1rem, 2vw, 1.2rem); line-height: 1.65; }
.hero-meta { display: flex; flex-wrap: wrap; gap: .55rem; margin: 1rem 0 0; color: var(--muted); font-size: .82rem; }
.hero-meta span { border: 1px solid var(--border); border-radius: 999px; padding: .35rem .6rem; background: var(--surface); }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 19rem; gap: 1rem; align-items: start; margin-top: clamp(1.5rem, 4vw, 2.75rem); }
.player-card, .chapter-card, .details-card { border: 1px solid var(--border); border-radius: 1.1rem; background: var(--surface); box-shadow: 0 24px 70px rgba(0, 0, 0, .18); }
.player-card { overflow: hidden; }
.video-wrap { position: relative; aspect-ratio: 16 / 9; background: #000; }
video { display: block; width: 100%; height: 100%; object-fit: contain; background: #000; }
.end-prompt { position: absolute; inset: auto 1rem 1rem; z-index: 2; border: 1px solid color-mix(in srgb, var(--primary) 45%, var(--border)); border-radius: .95rem; padding: 1rem; background: color-mix(in srgb, var(--background) 92%, transparent); box-shadow: 0 18px 50px rgba(0, 0, 0, .4); backdrop-filter: blur(14px); }
.end-prompt h2 { max-width: 22ch; margin: 0; font-size: clamp(1.25rem, 3vw, 2rem); line-height: 1.05; }
.end-prompt .eyebrow { margin-bottom: .45rem; }
.end-actions { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: .9rem; }
.player-toolbar { display: flex; align-items: center; justify-content: space-between; gap: .8rem; border-top: 1px solid var(--border); padding: .85rem 1rem; }
.playback-tools { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; color: var(--muted); font-size: .82rem; }
.playback-tools label { font-weight: 700; }
.playback-tools select, .utility-button, .transcript-tools input { min-height: 2.4rem; border: 1px solid var(--border); border-radius: .6rem; padding: .48rem .65rem; color: var(--text); background: var(--surface-strong); font: inherit; }
.utility-button { cursor: pointer; font-weight: 680; }
.utility-button:hover { border-color: var(--primary); }
.player-primary-cta { flex: 0 0 auto; }
.player-copy { padding: 1rem 1.1rem 1.15rem; }
.player-copy p { margin: 0; color: var(--muted); font-size: .9rem; line-height: 1.5; }
.demo-boundary { display: grid; gap: .55rem; border-top: 1px solid var(--border); padding: 1rem 1.1rem 1.15rem; background: color-mix(in srgb, var(--primary) 6%, transparent); }
.demo-boundary p { margin: 0; color: var(--muted); font-size: .84rem; line-height: 1.5; }
.boundary-badges { display: flex; flex-wrap: wrap; gap: .45rem; }
.badge { border: 1px solid var(--border); border-radius: 999px; padding: .28rem .55rem; color: var(--text); background: var(--surface-strong); font-size: .72rem; font-weight: 760; letter-spacing: .025em; }
.badge-synthetic { border-color: color-mix(in srgb, var(--primary) 55%, var(--border)); color: var(--primary); }
.chapter-card { position: sticky; top: 1rem; padding: .9rem; }
.chapter-heading { display: flex; align-items: baseline; justify-content: space-between; gap: .6rem; margin: .25rem .35rem .75rem; }
.chapter-heading h2 { margin: 0; font-size: .88rem; letter-spacing: .04em; text-transform: uppercase; }
.chapter-heading span { color: var(--muted); font-size: .75rem; }
.chapters { display: grid; gap: .38rem; margin: 0; padding: 0; list-style: none; }
.chapter-button { display: grid; grid-template-columns: 3rem 1fr; gap: .55rem; width: 100%; border: 0; border-radius: .72rem; padding: .72rem; color: var(--muted); background: transparent; font: inherit; text-align: left; cursor: pointer; }
.chapter-button:hover, .chapter-button[aria-current="true"] { color: var(--text); background: var(--surface-strong); }
.chapter-button[aria-current="true"] { box-shadow: inset 3px 0 0 var(--primary); }
.time { color: var(--primary); font-variant-numeric: tabular-nums; font-size: .78rem; }
.chapter-title { font-size: .88rem; font-weight: 650; line-height: 1.35; }
.actions { display: flex; flex-wrap: wrap; gap: .7rem; margin-top: 1rem; }
.cta { display: inline-flex; min-height: 2.85rem; align-items: center; justify-content: center; border: 1px solid var(--border); border-radius: .72rem; padding: .65rem 1rem; font-weight: 720; text-decoration: none; }
.cta-primary { border-color: var(--primary); background: var(--primary); color: var(--primary-text); }
.cta-secondary { background: var(--surface); color: var(--text); }
.details-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-top: 1rem; }
.details-card { padding: 1rem 1.1rem; }
summary { cursor: pointer; font-weight: 700; }
.transcript-tools { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .45rem; align-items: end; margin-top: 1rem; }
.transcript-tools label { grid-column: 1 / -1; color: var(--muted); font-size: .8rem; font-weight: 700; }
.transcript-status { grid-column: 1 / -1; color: var(--muted); font-size: .76rem; }
.transcript { display: grid; gap: .85rem; margin: 1rem 0 0; padding: 0; list-style: none; }
.transcript li { display: grid; grid-template-columns: 3.5rem 1fr; gap: .65rem; color: var(--muted); font-size: .9rem; line-height: 1.5; }
.transcript-time { align-self: start; border: 0; border-radius: .35rem; padding: .15rem .25rem; color: var(--primary); background: transparent; font: inherit; font-size: .78rem; font-variant-numeric: tabular-nums; cursor: pointer; }
.transcript-time:hover { background: var(--surface-strong); }
.key-grid { display: grid; grid-template-columns: auto 1fr; gap: .45rem .75rem; margin: 1rem 0 0; color: var(--muted); font-size: .9rem; }
kbd { min-width: 2rem; border: 1px solid var(--border); border-bottom-width: 2px; border-radius: .35rem; padding: .12rem .35rem; color: var(--text); background: var(--surface-strong); font: inherit; font-size: .78rem; text-align: center; }
.disclaimer { color: var(--muted); font-size: .82rem; line-height: 1.5; }
.status, .clipboard-fallback { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
:focus-visible { outline: 3px solid var(--primary); outline-offset: 3px; }
@media (max-width: 840px) { .layout { grid-template-columns: 1fr; } .chapter-card { position: static; } .chapters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 580px) { .shell { width: min(100% - 1rem, 1180px); } .layout { margin-top: 1.25rem; } .chapters, .details-grid { grid-template-columns: 1fr; } .actions, .end-actions { display: grid; } .cta { width: 100%; } .player-toolbar { align-items: stretch; flex-direction: column; } .player-primary-cta { width: 100%; } .transcript-tools { grid-template-columns: 1fr; } .transcript-tools label, .transcript-status { grid-column: 1; } .end-prompt { inset: auto .5rem .5rem; } .player-card, .chapter-card, .details-card { border-radius: .85rem; } }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
@media print { .chapter-card, .actions, video { display: none; } .layout { grid-template-columns: 1fr; } }
`;

interface Rgb {
  red: number;
  green: number;
  blue: number;
}

function parseHex(value: string): Rgb {
  return {
    red: Number.parseInt(value.slice(1, 3), 16),
    green: Number.parseInt(value.slice(3, 5), 16),
    blue: Number.parseInt(value.slice(5, 7), 16),
  };
}

function luminance(value: string): number {
  const rgb = parseHex(value);
  const channels = [rgb.red, rgb.green, rgb.blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function blend(value: string, toward: "black" | "white", amount: number): string {
  const rgb = parseHex(value);
  const target = toward === "white" ? 255 : 0;
  const channel = (current: number) => Math.round(current + (target - current) * amount);
  return `rgb(${String(channel(rgb.red))} ${String(channel(rgb.green))} ${String(channel(rgb.blue))})`;
}

export function createViewerStyles(colors: { primary: string; background: string }): string {
  const dark = luminance(colors.background) < 0.45;
  const replacements: Record<string, string> = {
    __SCHEME__: dark ? "dark" : "light",
    __BACKGROUND__: colors.background,
    __SURFACE__: blend(colors.background, dark ? "white" : "black", 0.055),
    __SURFACE_STRONG__: blend(colors.background, dark ? "white" : "black", 0.11),
    __TEXT__: dark ? "#f7f8fb" : "#111318",
    __MUTED__: dark ? "#b5bbc8" : "#4d5563",
    __PRIMARY__: colors.primary,
    __PRIMARY_TEXT__: luminance(colors.primary) < 0.42 ? "#ffffff" : "#101216",
    __BORDER__: blend(colors.background, dark ? "white" : "black", 0.18),
  };
  return Object.entries(replacements).reduce(
    (styles, [token, value]) => styles.replaceAll(token, value),
    STYLE_TEMPLATE,
  );
}
