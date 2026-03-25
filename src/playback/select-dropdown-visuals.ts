import type { BoundingBox } from "./types.js";
import type { PlaywrightPage } from "./playwright.js";

const SELECT_DROPDOWN_ID = "dm-select-dropdown";

interface SelectDropdownOption {
  value: string;
  text: string;
  disabled: boolean;
  isTarget: boolean;
}

/**
 * Approach A: Clone the real `<select>` and expand it as a listbox below the element.
 * Returns bounding boxes of each `<option>` in the expanded clone.
 */
export async function openClonedListbox(
  page: PlaywrightPage,
  selectBox: BoundingBox,
): Promise<Array<BoundingBox | null>> {
  await page.evaluate(
    ((p: { id: string; box: BoundingBox }) => {
      const existing = document.getElementById(p.id);
      if (existing) existing.remove();

      const centerX = p.box.x + p.box.width / 2;
      const centerY = p.box.y + p.box.height / 2;
      const original = document.elementFromPoint(centerX, centerY) as HTMLSelectElement | null;
      if (!original || original.tagName !== "SELECT") return;

      const clone = original.cloneNode(true) as HTMLSelectElement;
      clone.id = p.id;
      clone.size = Math.min(clone.options.length, 10);
      clone.style.cssText = [
        "position:fixed",
        `left:${p.box.x}px`,
        `top:${p.box.y + p.box.height + 2}px`,
        `width:${Math.max(p.box.width, 180)}px`,
        "z-index:999998",
        "border:1px solid #767676",
        "box-shadow:0 4px 16px rgba(0,0,0,0.25)",
        "border-radius:4px",
        "background:#fff",
        "outline:none",
        "font:400 13px/1.4 system-ui,sans-serif",
        "opacity:0",
        "transition:opacity .15s ease",
        "pointer-events:none",
      ].join(";");
      for (const opt of Array.from(clone.options)) {
        opt.style.cssText = "padding:4px 8px;cursor:default;";
        opt.selected = false;
      }
      document.body.appendChild(clone);
      window.requestAnimationFrame(() => {
        clone.style.opacity = "1";
      });
    }) as (...args: unknown[]) => unknown,
    { id: SELECT_DROPDOWN_ID, box: selectBox } as unknown,
  );

  await page.waitForTimeout(180);

  return (await page.evaluate(
    ((id: string) => {
      const clone = document.getElementById(id) as HTMLSelectElement | null;
      if (!clone) return [];
      return Array.from(clone.options).map((opt) => {
        const r = opt.getBoundingClientRect();
        return r.width > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
      });
    }) as (...args: unknown[]) => unknown,
    SELECT_DROPDOWN_ID as unknown,
  )) as Array<BoundingBox | null>;
}

/** Highlight an option in the cloned listbox (Approach A). */
export async function highlightClonedOption(
  page: PlaywrightPage,
  index: number,
  isTarget: boolean,
): Promise<void> {
  await page.evaluate(
    ((p: { id: string; index: number; isTarget: boolean }) => {
      const clone = document.getElementById(p.id) as HTMLSelectElement | null;
      if (!clone) return;
      for (const opt of Array.from(clone.options)) {
        opt.style.background = "";
        opt.style.color = "";
        opt.style.fontWeight = "";
      }
      const target = clone.options[p.index];
      if (!target) return;
      if (p.isTarget) {
        target.style.background = "#1a73e8";
        target.style.color = "#fff";
        target.style.fontWeight = "600";
      } else {
        target.style.background = "#e8f0fe";
        target.style.color = "#000";
      }
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }) as (...args: unknown[]) => unknown,
    { id: SELECT_DROPDOWN_ID, index, isTarget } as unknown,
  );
}

/**
 * Approach C: Open a polished fake overlay styled like Chrome's native dropdown.
 * Returns bounding boxes of each option row.
 */
export async function openFakeDropdown(
  page: PlaywrightPage,
  selectBox: BoundingBox,
  options: SelectDropdownOption[],
): Promise<Array<BoundingBox | null>> {
  await page.evaluate(
    ((p: { id: string; box: BoundingBox; options: SelectDropdownOption[] }) => {
      const existing = document.getElementById(p.id);
      if (existing) existing.remove();

      const dropHeight = Math.min(p.options.length * 32 + 8, 240);
      const spaceBelow = window.innerHeight - (p.box.y + p.box.height);
      const top =
        spaceBelow >= dropHeight || spaceBelow >= p.box.y
          ? p.box.y + p.box.height + 2
          : p.box.y - dropHeight - 2;

      const el = document.createElement("div");
      el.id = p.id;
      el.style.cssText = [
        "position:fixed",
        `left:${p.box.x}px`,
        `top:${top}px`,
        `width:${Math.max(p.box.width, 180)}px`,
        "max-height:240px",
        "overflow-y:auto",
        "background:#fff",
        "border:1px solid #c0c0c0",
        "border-radius:4px",
        "box-shadow:0 4px 16px rgba(0,0,0,0.18)",
        "z-index:999998",
        "opacity:0",
        "transform:scaleY(0.96)",
        "transform-origin:top left",
        "transition:opacity .12s ease,transform .12s ease",
        "pointer-events:none",
        "font:400 13px/1.2 system-ui,-apple-system,sans-serif",
        "color:#000",
        "padding:4px 0",
      ].join(";");

      for (const opt of p.options) {
        const row = document.createElement("div");
        row.className = "dm-select-option";
        row.style.cssText = [
          "padding:6px 12px",
          "cursor:default",
          "white-space:nowrap",
          "overflow:hidden",
          "text-overflow:ellipsis",
          "transition:background .08s ease",
          opt.disabled ? "color:#999" : "",
        ]
          .filter(Boolean)
          .join(";");
        row.textContent = opt.text;
        el.appendChild(row);
      }

      document.body.appendChild(el);
      window.requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transform = "scaleY(1)";
      });
    }) as (...args: unknown[]) => unknown,
    { id: SELECT_DROPDOWN_ID, box: selectBox, options } as unknown,
  );

  await page.waitForTimeout(150);

  return (await page.evaluate(
    ((id: string) => {
      const container = document.getElementById(id);
      if (!container) return [];
      const rows = container.querySelectorAll(".dm-select-option");
      return Array.from(rows).map((row) => {
        const r = row.getBoundingClientRect();
        return r.width > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
      });
    }) as (...args: unknown[]) => unknown,
    SELECT_DROPDOWN_ID as unknown,
  )) as Array<BoundingBox | null>;
}

/** Highlight an option in the fake dropdown (Approach C). */
export async function highlightFakeOption(
  page: PlaywrightPage,
  index: number,
  isTarget: boolean,
): Promise<void> {
  await page.evaluate(
    ((p: { id: string; index: number; isTarget: boolean }) => {
      const container = document.getElementById(p.id);
      if (!container) return;
      const rows = container.querySelectorAll(".dm-select-option");
      for (const row of Array.from(rows)) {
        (row as HTMLElement).style.background = "";
        (row as HTMLElement).style.color = "";
        (row as HTMLElement).style.fontWeight = "";
      }
      const target = rows[p.index] as HTMLElement | undefined;
      if (!target) return;
      if (p.isTarget) {
        target.style.background = "#1a73e8";
        target.style.color = "#fff";
        target.style.fontWeight = "600";
      } else {
        target.style.background = "#e8f0fe";
        target.style.color = "#000";
      }
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }) as (...args: unknown[]) => unknown,
    { id: SELECT_DROPDOWN_ID, index, isTarget } as unknown,
  );
}

/** Close and remove the select dropdown overlay (Approach A & C). */
export async function closeSelectDropdown(page: PlaywrightPage): Promise<void> {
  await page.evaluate(
    ((id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.transition = "opacity .12s ease, transform .12s ease";
      el.style.opacity = "0";
      el.style.transform = "scaleY(0.96)";
      window.setTimeout(() => el.remove(), 180);
    }) as (...args: unknown[]) => unknown,
    SELECT_DROPDOWN_ID as unknown,
  );
  await page.waitForTimeout(180);
}

/** Read all options from a `<select>` element at the given bounding box. */
export async function readSelectOptions(
  page: PlaywrightPage,
  selectBox: BoundingBox,
  optionSpec: { value?: string; label?: string; index?: number },
): Promise<SelectDropdownOption[]> {
  return (await page.evaluate(
    ((p: { box: BoundingBox; spec: { value?: string; label?: string; index?: number } }) => {
      const centerX = p.box.x + p.box.width / 2;
      const centerY = p.box.y + p.box.height / 2;
      const el = document.elementFromPoint(centerX, centerY) as HTMLSelectElement | null;
      if (!el || el.tagName !== "SELECT") return [];
      return Array.from(el.options).map((opt, idx) => ({
        value: opt.value,
        text: opt.textContent?.trim() ?? opt.value,
        disabled: opt.disabled,
        isTarget:
          (p.spec.value !== undefined && opt.value === p.spec.value) ||
          (p.spec.label !== undefined && (opt.textContent?.trim() ?? "") === p.spec.label) ||
          (p.spec.index !== undefined && idx === p.spec.index),
      }));
    }) as (...args: unknown[]) => unknown,
    { box: selectBox, spec: optionSpec } as unknown,
  )) as SelectDropdownOption[];
}
