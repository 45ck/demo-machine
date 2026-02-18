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
