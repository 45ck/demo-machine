import type { BoundingBox } from "./types.js";
import type { PlaywrightPage } from "./playwright.js";

const FOCUS_ID = "dm-focus-ring";
const SPOTLIGHT_ID = "dm-spotlight";

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
  await page.evaluate(
    ((p: { b: { x: number; y: number; width: number; height: number }; id: string }) => {
      const el = document.getElementById(p.id);
      if (!el) return;
      const pad = 10;
      const x = Math.max(0, p.b.x - pad);
      const y = Math.max(0, p.b.y - pad);
      const w = Math.max(8, p.b.width + pad * 2);
      const h = Math.max(8, p.b.height + pad * 2);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.transform = `translate(${x}px, ${y}px) scale(1)`;
      el.style.opacity = "1";
      el.animate(
        [
          { transform: `translate(${x}px, ${y}px) scale(0.985)` },
          { transform: `translate(${x}px, ${y}px) scale(1)` },
        ],
        { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
      window.setTimeout(() => {
        el.style.opacity = "0";
      }, 420);
    }) as (...args: unknown[]) => unknown,
    { b: box, id: FOCUS_ID } as unknown,
  );
}

export async function flashSpotlight(page: PlaywrightPage, box: BoundingBox | null): Promise<void> {
  if (!box) return;
  await ensureSpotlightOverlay(page);
  await page.evaluate(
    ((p: { b: { x: number; y: number; width: number; height: number }; id: string }) => {
      const el = document.getElementById(p.id);
      if (!el) return;

      const pad = 14;
      const x = Math.max(0, p.b.x - pad);
      const y = Math.max(0, p.b.y - pad);
      const w = Math.max(8, p.b.width + pad * 2);
      const h = Math.max(8, p.b.height + pad * 2);

      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.transform = `translate(${x}px, ${y}px) scale(1)`;
      el.style.opacity = "1";

      el.animate(
        [
          { opacity: 0, transform: `translate(${x}px, ${y}px) scale(0.985)` },
          { opacity: 1, transform: `translate(${x}px, ${y}px) scale(1)` },
          { opacity: 0, transform: `translate(${x}px, ${y}px) scale(1.006)` },
        ],
        { duration: 520, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );

      window.setTimeout(() => {
        el.style.opacity = "0";
      }, 560);
    }) as (...args: unknown[]) => unknown,
    { b: box, id: SPOTLIGHT_ID } as unknown,
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
