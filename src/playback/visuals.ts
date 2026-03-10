import type { BoundingBox } from "./types.js";
import type { PlaywrightPage } from "./playwright.js";

const FOCUS_ID = "dm-focus-ring";
const SPOTLIGHT_ID = "dm-spotlight";

function paddedBox(
  box: BoundingBox,
  pad: number,
): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, Math.round(box.x - pad));
  const y = Math.max(0, Math.round(box.y - pad));
  const width = Math.max(8, Math.round(box.width + pad * 2));
  const height = Math.max(8, Math.round(box.height + pad * 2));
  return { x, y, width, height };
}

async function ensureFocusOverlay(page: PlaywrightPage): Promise<void> {
  await page.evaluate(
    ((id: string) => {
      if (!document.getElementById(id)) {
        const el = document.createElement("div");
        el.id = id;
        document.body.appendChild(el);
      }
    }) as (...args: unknown[]) => unknown,
    FOCUS_ID as unknown,
  );
}

async function ensureSpotlightOverlay(page: PlaywrightPage): Promise<void> {
  await page.evaluate(
    ((id: string) => {
      if (!document.getElementById(id)) {
        const el = document.createElement("div");
        el.id = id;
        document.body.appendChild(el);
      }
    }) as (...args: unknown[]) => unknown,
    SPOTLIGHT_ID as unknown,
  );
}

export async function pulseFocus(page: PlaywrightPage, box: BoundingBox | null): Promise<void> {
  if (!box) return;
  await ensureFocusOverlay(page);
  const b = paddedBox(box, 10);
  await page.evaluate(
    ((p: { b: { x: number; y: number; width: number; height: number }; id: string }) => {
      const el = document.getElementById(p.id);
      if (!el) return;
      const x = p.b.x;
      const y = p.b.y;
      const w = p.b.width;
      const h = p.b.height;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.transform = `translate(${x}px, ${y}px) scale(1)`;
      el.style.opacity = "1";
      el.animate(
        [
          { transform: `translate(${x}px, ${y}px) scale(0.985)` },
          { transform: `translate(${x}px, ${y}px) scale(1.01)` },
          { transform: `translate(${x}px, ${y}px) scale(1)` },
        ],
        { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
      window.setTimeout(() => {
        el.style.opacity = "0";
      }, 520);
    }) as (...args: unknown[]) => unknown,
    { b, id: FOCUS_ID } as unknown,
  );
}

export async function flashSpotlight(page: PlaywrightPage, box: BoundingBox | null): Promise<void> {
  if (!box) return;
  await ensureSpotlightOverlay(page);
  const b = paddedBox(box, 14);
  await page.evaluate(
    ((p: { b: { x: number; y: number; width: number; height: number }; id: string }) => {
      const el = document.getElementById(p.id);
      if (!el) return;
      const x = p.b.x;
      const y = p.b.y;
      const w = p.b.width;
      const h = p.b.height;

      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.transform = `translate(${x}px, ${y}px) scale(1)`;
      el.style.opacity = "1";

      el.animate(
        [
          { opacity: 0, transform: `translate(${x}px, ${y}px) scale(0.985)` },
          { opacity: 1, transform: `translate(${x}px, ${y}px) scale(1)` },
          { opacity: 1, transform: `translate(${x}px, ${y}px) scale(1.002)` },
          { opacity: 0, transform: `translate(${x}px, ${y}px) scale(1.008)` },
        ],
        { duration: 640, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );

      window.setTimeout(() => {
        el.style.opacity = "0";
      }, 720);
    }) as (...args: unknown[]) => unknown,
    { b, id: SPOTLIGHT_ID } as unknown,
  );
}

const KEY_BADGE_ID = "dm-key-badge";
const KEY_BADGE_SHOW_CLASS = "dm-kb-show";
const KEY_BADGE_DURATION_MS = 900;

const KEY_LABEL_MAP: Record<string, string> = {
  Enter: "Enter ↵",
  Escape: "Esc",
  Tab: "Tab ⇥",
  Backspace: "⌫ Backspace",
  Delete: "Del",
  Space: "Space",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Home: "Home",
  End: "End",
  PageUp: "Page ↑",
  PageDown: "Page ↓",
};

function formatKeyLabel(key: string): string {
  return KEY_LABEL_MAP[key] ?? key;
}

async function ensureKeyBadge(page: PlaywrightPage): Promise<void> {
  await page.evaluate(
    ((id: string) => {
      if (!document.getElementById(id)) {
        const el = document.createElement("div");
        el.id = id;
        document.body.appendChild(el);
      }
    }) as (...args: unknown[]) => unknown,
    KEY_BADGE_ID as unknown,
  );
}

export async function showKeyBadge(page: PlaywrightPage, key: string): Promise<void> {
  const label = formatKeyLabel(key);
  await ensureKeyBadge(page);
  await page.evaluate(
    ((p: { id: string; label: string; cls: string; dur: number }) => {
      const el = document.getElementById(p.id) as (HTMLElement & { _dmKbTimer?: number }) | null;
      if (!el) return;
      el.textContent = p.label;
      el.classList.add(p.cls);
      window.clearTimeout(el._dmKbTimer);
      el._dmKbTimer = window.setTimeout(() => {
        el.classList.remove(p.cls);
      }, p.dur);
    }) as (...args: unknown[]) => unknown,
    { id: KEY_BADGE_ID, label, cls: KEY_BADGE_SHOW_CLASS, dur: KEY_BADGE_DURATION_MS } as unknown,
  );
}

const FILE_PICKER_ID = "dm-file-picker";
const FILE_PICKER_SHOW_MS = 1300;

export async function showFilePickerOverlay(
  page: PlaywrightPage,
  filenames: string[],
): Promise<void> {
  const label =
    filenames.length === 1 ? (filenames[0] ?? "file") : `${String(filenames.length)} files`;

  await page.evaluate(
    ((p: { id: string; label: string }) => {
      const existing = document.getElementById(p.id);
      if (existing) existing.remove();
      const el = document.createElement("div");
      el.id = p.id;
      el.style.cssText = [
        "position:fixed",
        "top:50%",
        "left:50%",
        "transform:translate(-50%,-50%)",
        "background:#1e2330",
        "border:1px solid #334155",
        "border-radius:12px",
        "padding:20px 28px",
        "color:#e2e8f0",
        "font:600 14px/1.5 ui-sans-serif,system-ui,sans-serif",
        "z-index:2147483647",
        "box-shadow:0 20px 60px rgba(0,0,0,.6)",
        "opacity:0",
        "transition:opacity .25s",
        "text-align:center",
        "min-width:220px",
      ].join(";");
      el.innerHTML =
        `<div style="color:#64748b;font-size:11px;font-weight:600;letter-spacing:.06em;` +
        `text-transform:uppercase;margin-bottom:8px">📂 File selected</div>` +
        `<div>${p.label}</div>`;
      document.body.appendChild(el);
      window.requestAnimationFrame(() => {
        el.style.opacity = "1";
      });
    }) as (...args: unknown[]) => unknown,
    { id: FILE_PICKER_ID, label } as unknown,
  );

  await page.waitForTimeout(FILE_PICKER_SHOW_MS);

  await page.evaluate(
    ((id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.transition = "opacity .3s";
      el.style.opacity = "0";
      window.setTimeout(() => el.remove(), 350);
    }) as (...args: unknown[]) => unknown,
    FILE_PICKER_ID as unknown,
  );
}

const SELECT_OVERLAY_ID = "dm-select-overlay";
const SELECT_OVERLAY_SHOW_MS = 1200;

export async function showSelectOverlay(page: PlaywrightPage, optionText: string): Promise<void> {
  await page.evaluate(
    ((p: { id: string; label: string }) => {
      const existing = document.getElementById(p.id);
      if (existing) existing.remove();
      const el = document.createElement("div");
      el.id = p.id;
      el.style.cssText = [
        "position:fixed",
        "bottom:24px",
        "left:50%",
        "transform:translateX(-50%)",
        "background:#1e2330",
        "border:1px solid #334155",
        "border-radius:10px",
        "padding:10px 20px",
        "color:#e2e8f0",
        "font:600 13px/1.5 ui-sans-serif,system-ui,sans-serif",
        "z-index:2147483647",
        "box-shadow:0 8px 32px rgba(0,0,0,.5)",
        "opacity:0",
        "transition:opacity .2s",
        "white-space:nowrap",
      ].join(";");
      el.innerHTML = `<span style="color:#64748b;margin-right:6px">Selected:</span>${p.label}`;
      document.body.appendChild(el);
      window.requestAnimationFrame(() => {
        el.style.opacity = "1";
      });
    }) as (...args: unknown[]) => unknown,
    { id: SELECT_OVERLAY_ID, label: optionText } as unknown,
  );

  await page.waitForTimeout(SELECT_OVERLAY_SHOW_MS);

  await page.evaluate(
    ((id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.transition = "opacity .25s";
      el.style.opacity = "0";
      window.setTimeout(() => el.remove(), 300);
    }) as (...args: unknown[]) => unknown,
    SELECT_OVERLAY_ID as unknown,
  );
}

export async function spawnRipple(page: PlaywrightPage, box: BoundingBox | null): Promise<void> {
  if (!box) return;
  await page.evaluate(
    ((b: { x: number; y: number; width: number; height: number }) => {
      const x = b.x + b.width / 2;
      const y = b.y + b.height / 2;
      const el = document.createElement("div");
      el.className = "dm-ripple";
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      document.body.appendChild(el);
      window.setTimeout(() => el.remove(), 800);
    }) as (...args: unknown[]) => unknown,
    box as unknown,
  );
}
