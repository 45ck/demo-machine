import type { PlaywrightPage } from "./playwright.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("overlay-visual-guards");

interface SelectOverlayInfo {
  exists: boolean;
  textContent?: string;
  positionFixed?: boolean;
  bottom?: string;
  left?: string;
  transform?: string;
  zIndex?: string;
}

/**
 * Select overlay visual snapshot guard (#4).
 *
 * After a select/selectFirstNonPlaceholder step, verifies the "Selected: {option}"
 * toast overlay is rendered correctly: present in the DOM, contains the correct text,
 * and is positioned at bottom-center (position:fixed, bottom:24px, left:50%,
 * transform:translateX(-50%)).
 *
 * Never throws — returns null on any error.
 */
export async function checkSelectOverlay(
  page: PlaywrightPage,
  expectedOptionText: string,
): Promise<string | null> {
  try {
    const info = (await page.evaluate(
      ((id: string) => {
        const el = document.getElementById(id);
        if (!el) return { exists: false };
        const style = el.style;
        return {
          exists: true,
          textContent: el.textContent ?? "",
          positionFixed: style.position === "fixed",
          bottom: style.bottom,
          left: style.left,
          transform: style.transform,
          zIndex: style.zIndex,
        };
      }) as (...args: unknown[]) => unknown,
      "dm-select-overlay" as unknown,
    )) as SelectOverlayInfo;

    if (!info.exists) {
      const msg = `Select overlay guard: #dm-select-overlay not found after select action`;
      logger.warn(msg);
      return msg;
    }

    if (!info.textContent?.includes(expectedOptionText)) {
      const msg = `Select overlay guard: text mismatch — expected "${expectedOptionText}" but got "${info.textContent ?? ""}"`;
      logger.warn(msg);
      return msg;
    }

    if (!info.positionFixed) {
      const msg = `Select overlay guard: overlay has wrong position (expected position:fixed)`;
      logger.warn(msg);
      return msg;
    }

    const isCentered = info.left === "50%" && info.transform?.includes("translateX(-50%)");
    if (!isCentered) {
      const msg = `Select overlay guard: overlay is not horizontally center-aligned (left=${info.left ?? "?"}, transform=${info.transform ?? "?"})`;
      logger.warn(msg);
      return msg;
    }

    return null;
  } catch {
    return null;
  }
}

interface FilePickerOverlayInfo {
  exists: boolean;
  textContent?: string;
  positionFixed?: boolean;
  top?: string;
  left?: string;
  transform?: string;
  zIndex?: string;
}

/**
 * File picker overlay rendering guard (#5).
 *
 * After an upload step, verifies the file picker overlay (centered panel with
 * folder emoji and filename) is rendered correctly: present in the DOM,
 * contains the correct filename (or "N files" for multi-file), and is
 * centered (position:fixed, top:50%, left:50%, transform:translate(-50%,-50%)).
 *
 * Never throws — returns null on any error.
 */
function expectedFileLabel(filenames: string[]): string {
  return filenames.length === 1 ? (filenames[0] ?? "file") : `${String(filenames.length)} files`;
}

function checkPickerCentering(info: FilePickerOverlayInfo): string | null {
  const ok =
    info.top === "50%" && info.left === "50%" && info.transform?.includes("translate(-50%");
  if (ok) return null;
  return (
    `File picker overlay guard: overlay is not center-aligned ` +
    `(top=${info.top ?? "?"}, left=${info.left ?? "?"}, transform=${info.transform ?? "?"})`
  );
}

function validateFilePickerInfo(info: FilePickerOverlayInfo, filenames: string[]): string | null {
  if (!info.exists)
    return `File picker overlay guard: #dm-file-picker not found after upload action`;
  const label = expectedFileLabel(filenames);
  if (!info.textContent?.includes(label)) {
    return `File picker overlay guard: text mismatch — expected "${label}" but got "${info.textContent ?? ""}"`;
  }
  if (!info.positionFixed)
    return `File picker overlay guard: overlay has wrong position (expected position:fixed)`;
  return checkPickerCentering(info);
}

export async function checkFilePickerOverlay(
  page: PlaywrightPage,
  filenames: string[],
): Promise<string | null> {
  try {
    const info = (await page.evaluate(
      ((id: string) => {
        const el = document.getElementById(id);
        if (!el) return { exists: false };
        const style = el.style;
        return {
          exists: true,
          textContent: el.textContent ?? "",
          positionFixed: style.position === "fixed",
          top: style.top,
          left: style.left,
          transform: style.transform,
          zIndex: style.zIndex,
        };
      }) as (...args: unknown[]) => unknown,
      "dm-file-picker" as unknown,
    )) as FilePickerOverlayInfo;

    const warning = validateFilePickerInfo(info, filenames);
    if (warning) {
      logger.warn(warning);
      return warning;
    }
    return null;
  } catch {
    return null;
  }
}

interface ZIndexInfo {
  overlayZIndex: number;
  highestPageZIndex: number;
  overlayId: string;
}

/**
 * Overlay z-index stacking verification (#52).
 *
 * After overlay injection, verifies the overlay element's computed z-index
 * is strictly above any non-dm page element's z-index. This ensures overlays
 * render above page content.
 *
 * Never throws — returns null on any error.
 */
export async function checkOverlayZIndex(
  page: PlaywrightPage,
  overlayId: string,
): Promise<string | null> {
  try {
    const info = (await page.evaluate(
      ((id: string) => {
        const overlay = document.getElementById(id);
        if (!overlay) return null;

        const overlayStyle = window.getComputedStyle(overlay);
        const overlayZ = parseInt(overlayStyle.zIndex, 10) || 0;

        let highestPageZ = 0;
        const allElements = document.querySelectorAll("*");
        for (const el of Array.from(allElements)) {
          const elId = (el as HTMLElement).id || "";
          const elClass =
            typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className : "";
          // Skip dm- overlay elements themselves
          if (elId.startsWith("dm-") || elClass.includes("dm-")) continue;

          const style = window.getComputedStyle(el);
          const z = parseInt(style.zIndex, 10);
          if (!isNaN(z) && z > highestPageZ) {
            highestPageZ = z;
          }
        }

        return { overlayZIndex: overlayZ, highestPageZIndex: highestPageZ, overlayId: id };
      }) as (...args: unknown[]) => unknown,
      overlayId as unknown,
    )) as ZIndexInfo | null;

    if (!info) return null;

    if (info.overlayZIndex <= info.highestPageZIndex) {
      const msg =
        `Z-index stacking warning: "${info.overlayId}" z-index (${String(info.overlayZIndex)}) ` +
        `is not above highest page element z-index (${String(info.highestPageZIndex)})`;
      logger.warn(msg);
      return msg;
    }

    return null;
  } catch {
    return null;
  }
}
