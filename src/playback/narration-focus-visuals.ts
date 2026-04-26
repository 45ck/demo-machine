import type { BoundingBox, NarrationFocusConfig } from "./types.js";
import type { PlaywrightPage } from "./playwright.js";

const NARRATION_FOCUS_ID = "dm-narration-focus";
const NARRATION_CLICK_ID = "dm-narration-click";

type PaddedBox = { x: number; y: number; width: number; height: number };

function paddedBox(box: BoundingBox, pad: number): PaddedBox {
  const x = Math.max(0, Math.round(box.x - pad));
  const y = Math.max(0, Math.round(box.y - pad));
  const width = Math.max(8, Math.round(box.width + pad * 2));
  const height = Math.max(8, Math.round(box.height + pad * 2));
  return { x, y, width, height };
}

type BodyWithPreviousTransform = HTMLElement & {
  dataset: DOMStringMap & {
    dmPrevTransform?: string;
    dmPrevTransformOrigin?: string;
    dmPrevTransition?: string;
    dmPrevWillChange?: string;
    dmNarrationTransitionMs?: string;
  };
};

export async function showNarrationFocus(
  page: PlaywrightPage,
  box: BoundingBox,
  focus: NarrationFocusConfig,
): Promise<BoundingBox> {
  const b = paddedBox(box, 16);
  const mapped = await applyNarrationZoom(page, {
    b,
    zoom: focus.zoom,
    scale: focus.scale,
    transitionMs: focus.transitionMs,
  });
  if (focus.highlight) {
    await showNarrationRing(page, {
      id: NARRATION_FOCUS_ID,
      mapped,
      transitionMs: focus.transitionMs,
    });
  }
  return mapped;
}

export async function showNarrationClick(page: PlaywrightPage, box: BoundingBox): Promise<void> {
  await page.evaluate(
    ((p: { id: string; box: BoundingBox }) => {
      const x = p.box.x + p.box.width / 2;
      const y = p.box.y + p.box.height / 2;
      const existing = document.getElementById(p.id);
      if (existing) existing.remove();

      const el = document.createElement("div");
      el.id = p.id;
      el.style.cssText = [
        "position:fixed",
        "left:0",
        "top:0",
        "width:20px",
        "height:20px",
        "pointer-events:none",
        "z-index:2147483647",
        "border-radius:999px",
        "border:3px solid rgba(255,255,255,.94)",
        "box-shadow:0 0 0 5px rgba(56,189,248,.34),0 0 34px rgba(56,189,248,.78)",
        "transform:translate(-50%,-50%) scale(.2)",
        "opacity:1",
      ].join(";");
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      document.body.appendChild(el);
      el.animate(
        [
          { transform: "translate(-50%,-50%) scale(.2)", opacity: 1 },
          { transform: "translate(-50%,-50%) scale(1.25)", opacity: 0.95, offset: 0.35 },
          { transform: "translate(-50%,-50%) scale(2.5)", opacity: 0 },
        ],
        { duration: 520, easing: "cubic-bezier(0.16,1,0.3,1)" },
      );
      window.setTimeout(() => el.remove(), 560);
    }) as (...args: unknown[]) => unknown,
    { id: NARRATION_CLICK_ID, box } as unknown,
  );
}

async function applyNarrationZoom(
  page: PlaywrightPage,
  payload: { b: PaddedBox; zoom: boolean; scale: number; transitionMs: number },
): Promise<BoundingBox> {
  return (await page.evaluate(
    ((p: { b: PaddedBox; zoom: boolean; scale: number; transitionMs: number }) => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const docWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      const docHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const targetCx = p.b.x + p.b.width / 2;
      const targetCy = p.b.y + p.b.height / 2;
      const clamp = (value: number, min: number, max: number) =>
        Math.min(max, Math.max(min, value));
      const minTx = Math.min(0, viewport.width - docWidth * p.scale);
      const minTy = Math.min(0, viewport.height - docHeight * p.scale);
      const tx = p.zoom ? clamp(viewport.width * 0.5 - targetCx * p.scale, minTx, 0) : 0;
      const ty = p.zoom ? clamp(viewport.height * 0.46 - targetCy * p.scale, minTy, 0) : 0;
      const mapped = {
        x: tx + p.b.x * p.scale,
        y: ty + p.b.y * p.scale,
        width: p.b.width * p.scale,
        height: p.b.height * p.scale,
      };

      if (!p.zoom) return mapped;

      const w = window as typeof window & {
        __dmNarrationFocusTransform?: { tx: number; ty: number; scale: number };
      };
      w.__dmNarrationFocusTransform = { tx, ty, scale: p.scale };

      const elements = Array.from(document.body.children).filter((el) => {
        if (!(el instanceof HTMLElement)) return false;
        if (el.id.startsWith("dm-")) return false;
        return !["SCRIPT", "STYLE", "LINK"].includes(el.tagName);
      }) as BodyWithPreviousTransform[];

      for (const el of elements) {
        if (el.dataset.dmPrevTransform === undefined) {
          el.dataset.dmPrevTransform = el.style.transform;
          el.dataset.dmPrevTransformOrigin = el.style.transformOrigin;
          el.dataset.dmPrevTransition = el.style.transition;
          el.dataset.dmPrevWillChange = el.style.willChange;
        }
        el.style.transformOrigin = "0 0";
        el.style.transition = `transform ${p.transitionMs}ms cubic-bezier(0.16, 1, 0.3, 1)`;
        el.style.willChange = "transform";
        el.style.transform = `translate(${tx}px, ${ty}px) scale(${p.scale})`;
        el.dataset.dmNarrationTransitionMs = String(p.transitionMs);
      }

      const html = document.documentElement as HTMLElement & {
        dataset: DOMStringMap & { dmPrevOverflowX?: string };
      };
      if (html.dataset.dmPrevOverflowX === undefined) {
        html.dataset.dmPrevOverflowX = html.style.overflowX;
      }
      html.style.overflowX = "hidden";
      return mapped;
    }) as (...args: unknown[]) => unknown,
    payload as unknown,
  )) as BoundingBox;
}

async function showNarrationRing(
  page: PlaywrightPage,
  payload: { id: string; mapped: BoundingBox; transitionMs: number },
): Promise<void> {
  await page.evaluate(
    ((p: { id: string; mapped: BoundingBox; transitionMs: number }) => {
      const existing = document.getElementById(p.id);
      if (existing) existing.remove();

      const el = document.createElement("div");
      el.id = p.id;
      el.style.cssText = [
        "position:fixed",
        "left:0",
        "top:0",
        "pointer-events:none",
        "z-index:2147483646",
        "border:3px solid #38bdf8",
        "border-radius:12px",
        "box-shadow:0 0 0 9999px rgba(2,6,23,.30),0 0 36px rgba(56,189,248,.70)",
        "opacity:0",
        `transition:opacity ${Math.max(120, Math.round(p.transitionMs * 0.6))}ms ease,` +
          `transform ${p.transitionMs}ms cubic-bezier(0.16,1,0.3,1)`,
      ].join(";");
      el.style.width = `${p.mapped.width}px`;
      el.style.height = `${p.mapped.height}px`;
      el.style.transform = `translate(${p.mapped.x}px, ${p.mapped.y}px) scale(.985)`;
      document.body.appendChild(el);
      window.requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transform = `translate(${p.mapped.x}px, ${p.mapped.y}px) scale(1)`;
      });
    }) as (...args: unknown[]) => unknown,
    payload as unknown,
  );
}

export async function clearNarrationFocus(page: PlaywrightPage): Promise<void> {
  const resetMs = (await page.evaluate(
    ((id: string) => {
      const el = document.getElementById(id);
      if (el) {
        el.style.opacity = "0";
        window.setTimeout(() => el.remove(), 140);
      }

      const elements = Array.from(document.body.children).filter((el) => {
        return el instanceof HTMLElement && el.dataset["dmPrevTransform"] !== undefined;
      }) as BodyWithPreviousTransform[];
      let resetMs = 0;
      for (const body of elements) {
        const transitionMs = Number(body.dataset["dmNarrationTransitionMs"] ?? "0");
        resetMs = Math.max(resetMs, Number.isFinite(transitionMs) ? transitionMs : 0);
        body.style.transform = body.dataset["dmPrevTransform"] ?? "";
        window.setTimeout(
          () => {
            body.style.transformOrigin = body.dataset["dmPrevTransformOrigin"] ?? "";
            body.style.transition = body.dataset["dmPrevTransition"] ?? "";
            body.style.willChange = body.dataset["dmPrevWillChange"] ?? "";
            delete body.dataset["dmPrevTransform"];
            delete body.dataset["dmPrevTransformOrigin"];
            delete body.dataset["dmPrevTransition"];
            delete body.dataset["dmPrevWillChange"];
            delete body.dataset["dmNarrationTransitionMs"];
          },
          Math.max(0, transitionMs) + 60,
        );
      }

      const html = document.documentElement as HTMLElement & {
        dataset: DOMStringMap & { dmPrevOverflowX?: string };
      };
      window.setTimeout(() => {
        if (html.dataset.dmPrevOverflowX !== undefined) {
          html.style.overflowX = html.dataset.dmPrevOverflowX;
          delete html.dataset.dmPrevOverflowX;
        }

        const w = window as typeof window & {
          __dmNarrationFocusTransform?: { tx: number; ty: number; scale: number };
        };
        delete w.__dmNarrationFocusTransform;
      }, resetMs + 60);

      return resetMs;
    }) as (...args: unknown[]) => unknown,
    NARRATION_FOCUS_ID as unknown,
  )) as number;
  if (resetMs > 0) {
    await page.waitForTimeout(resetMs + 70);
  }
}
