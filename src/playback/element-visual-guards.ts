/* eslint-disable max-lines -- Browser-side Playwright evaluation helpers keep this module self-contained. */
import type { PlaywrightLocator } from "./playwright.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("element-visual-guards");
const DEFAULT_MIN_VISIBLE_RATIO = 0.98;

export interface ElementVisualRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface ElementVisualDescriptor {
  tag: string;
  id: string;
  className: string;
  zIndex: string;
  demoMachineElement: boolean;
}

export interface ElementCenterHitTest {
  x: number;
  y: number;
  blockedByNonDemoMachineElement: boolean;
  topIsDemoMachineElement: boolean;
  blocker: ElementVisualDescriptor | null;
}

export interface ImportantTextCoverage {
  text: string;
  found: boolean;
  rect: ElementVisualRect | null;
  coveredByDemoMachineOverlay: boolean;
  overlay: ElementVisualDescriptor | null;
}

export interface ElementVisualSnapshot {
  exists: boolean;
  label: string;
  rect: ElementVisualRect | null;
  viewport: { width: number; height: number };
  display: string;
  visibility: string;
  opacity: number;
  visibleRatio: number;
  clipped: boolean;
  centerHitTest: ElementCenterHitTest | null;
  importantText: ImportantTextCoverage[];
}

interface ElementVisualGuardOptions {
  label?: string;
  importantText?: string | string[];
  minVisibleRatio?: number;
}

type ElementVisualGuardFindingCode =
  | "missing"
  | "not-visible"
  | "outside-viewport"
  | "clipped"
  | "center-blocked"
  | "important-text-covered";

interface ElementVisualGuardFinding {
  code: ElementVisualGuardFindingCode;
  label: string;
  message: string;
  severity: "warn";
  details: {
    rect?: ElementVisualRect | null;
    viewport?: { width: number; height: number };
    visibleRatio?: number;
    minVisibleRatio?: number;
    display?: string;
    visibility?: string;
    opacity?: number;
    blocker?: ElementVisualDescriptor | null;
    text?: string;
    textRect?: ElementVisualRect | null;
    overlay?: ElementVisualDescriptor | null;
  };
}

interface ElementVisualGuardResult {
  ok: boolean;
  warnings: string[];
  findings: ElementVisualGuardFinding[];
  snapshot: ElementVisualSnapshot;
}

export function isElementVisible(snapshot: ElementVisualSnapshot): boolean {
  const rect = snapshot.rect;
  return Boolean(
    snapshot.exists &&
    rect &&
    rect.width > 0 &&
    rect.height > 0 &&
    snapshot.display !== "none" &&
    snapshot.visibility !== "hidden" &&
    snapshot.visibility !== "collapse" &&
    snapshot.opacity > 0,
  );
}

export function isElementInViewport(snapshot: ElementVisualSnapshot): boolean {
  const rect = snapshot.rect;
  return Boolean(
    rect &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < snapshot.viewport.width &&
    rect.top < snapshot.viewport.height,
  );
}

export function isElementNotClipped(
  snapshot: ElementVisualSnapshot,
  minVisibleRatio = DEFAULT_MIN_VISIBLE_RATIO,
): boolean {
  return snapshot.exists && snapshot.visibleRatio >= minVisibleRatio;
}

export function isCenterHitTestClear(snapshot: ElementVisualSnapshot): boolean {
  return snapshot.centerHitTest?.blockedByNonDemoMachineElement !== true;
}

export function isImportantTextUncoveredByDemoOverlays(snapshot: ElementVisualSnapshot): boolean {
  return snapshot.importantText.every(
    (entry) => !entry.found || !entry.coveredByDemoMachineOverlay,
  );
}

// eslint-disable-next-line max-lines-per-function -- Playwright serializes this function into the page context.
const readSnapshotInBrowser = ((
  target: unknown,
  args: { label: string; importantText: string[] },
) => {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const element = target instanceof Element ? target : null;
  if (!element) return emptySnapshot(args.label, viewport);

  const style = window.getComputedStyle(element);
  const rect = toRect(element.getBoundingClientRect());
  const visibleArea = visibleElementArea(element, rect, viewport);
  const totalArea = rect.width * rect.height;
  const visibleRatio = totalArea > 0 ? visibleArea / totalArea : 0;

  return {
    exists: true,
    label: args.label,
    rect,
    viewport,
    display: style.display,
    visibility: style.visibility,
    opacity: Number.parseFloat(style.opacity || "1"),
    visibleRatio,
    clipped: visibleRatio < 1,
    centerHitTest: inspectCenter(element, rect, viewport),
    importantText: args.importantText.map((text) => inspectText(element, text)),
  };

  function emptySnapshot(label: string, vp: { width: number; height: number }) {
    return {
      exists: false,
      label,
      rect: null,
      viewport: vp,
      display: "",
      visibility: "",
      opacity: 0,
      visibleRatio: 0,
      clipped: true,
      centerHitTest: null,
      importantText: [],
    };
  }

  function inspectCenter(
    el: Element,
    box: ElementVisualRect,
    vp: { width: number; height: number },
  ) {
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    if (x < 0 || y < 0 || x > vp.width || y > vp.height) return null;
    const top = document.elementFromPoint(x, y);
    if (!top || el === top || el.contains(top) || top.contains(el)) {
      return {
        x,
        y,
        blockedByNonDemoMachineElement: false,
        topIsDemoMachineElement: false,
        blocker: null,
      };
    }
    const blocker = describe(top);
    return {
      x,
      y,
      blockedByNonDemoMachineElement: !blocker.demoMachineElement,
      topIsDemoMachineElement: blocker.demoMachineElement,
      blocker,
    };
  }

  function inspectText(root: Element, text: string) {
    const rect = findTextRect(root, text);
    if (!rect)
      return { text, found: false, rect: null, coveredByDemoMachineOverlay: false, overlay: null };
    const points: Array<[number, number]> = [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + 1, rect.top + 1],
      [rect.right - 1, rect.bottom - 1],
    ];
    for (const [x, y] of points) {
      const top = document.elementFromPoint(x, y);
      if (!top || root === top || root.contains(top)) continue;
      const overlay = describe(top);
      if (overlay.demoMachineElement) {
        return { text, found: true, rect, coveredByDemoMachineOverlay: true, overlay };
      }
    }
    return { text, found: true, rect, coveredByDemoMachineOverlay: false, overlay: null };
  }

  function findTextRect(root: Element, text: string) {
    if (!text) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const start = (node.textContent ?? "").indexOf(text);
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      const rect = toRect(range.getBoundingClientRect());
      range.detach();
      return rect;
    }
    return null;
  }

  function describe(el: Element) {
    const html = el as HTMLElement;
    const className = typeof html.className === "string" ? html.className : "";
    return {
      tag: el.tagName,
      id: html.id,
      className,
      zIndex: window.getComputedStyle(el).zIndex,
      demoMachineElement: isDemoMachineElement(el),
    };
  }

  function isDemoMachineElement(el: Element) {
    for (let current: Element | null = el; current; current = current.parentElement) {
      const html = current as HTMLElement;
      const className = typeof html.className === "string" ? html.className : "";
      if (html.id.startsWith("dm-") || className.includes("dm-")) return true;
    }
    return false;
  }

  function visibleElementArea(
    el: Element,
    rect: ElementVisualRect,
    vp: { width: number; height: number },
  ) {
    let clipRect = viewportRect(vp);
    for (let current = el.parentElement; current; current = current.parentElement) {
      const currentStyle = window.getComputedStyle(current);
      if (!clipsOverflow(currentStyle)) continue;
      clipRect = intersectRects(clipRect, toRect(current.getBoundingClientRect()));
    }
    return rectArea(intersectRects(rect, clipRect));
  }

  function viewportRect(vp: { width: number; height: number }): ElementVisualRect {
    return {
      x: 0,
      y: 0,
      width: vp.width,
      height: vp.height,
      top: 0,
      right: vp.width,
      bottom: vp.height,
      left: 0,
    };
  }

  function clipsOverflow(style: CSSStyleDeclaration) {
    return (
      clipsOverflowValue(style.overflow) ||
      clipsOverflowValue(style.overflowX) ||
      clipsOverflowValue(style.overflowY)
    );
  }

  function clipsOverflowValue(value: string) {
    return value === "hidden" || value === "auto" || value === "scroll" || value === "clip";
  }

  function intersectRects(a: ElementVisualRect, b: ElementVisualRect): ElementVisualRect {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    return {
      x: left,
      y: top,
      width,
      height,
      top,
      right: left + width,
      bottom: top + height,
      left,
    };
  }

  function rectArea(rect: ElementVisualRect) {
    return rect.width * rect.height;
  }

  function toRect(rect: DOMRect): ElementVisualRect {
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
    };
  }
}) as (...args: unknown[]) => unknown;

export async function readElementVisualSnapshot(
  locator: PlaywrightLocator,
  options: ElementVisualGuardOptions = {},
): Promise<ElementVisualSnapshot | null> {
  try {
    return (await locator.evaluate(readSnapshotInBrowser, {
      label: options.label ?? "target",
      importantText: normalizeImportantText(options.importantText),
    } as unknown)) as ElementVisualSnapshot;
  } catch {
    return null;
  }
}

export async function checkElementVisualGuards(
  locator: PlaywrightLocator,
  options: ElementVisualGuardOptions = {},
): Promise<ElementVisualGuardResult | null> {
  const snapshot = await readElementVisualSnapshot(locator, options);
  if (!snapshot) return null;
  const findings = collectElementVisualGuardFindings(snapshot, options);
  const warnings = findings.map((finding) => finding.message);
  for (const warning of warnings) logger.warn(warning);
  return { ok: findings.length === 0, warnings, findings, snapshot };
}

export function validateElementVisualSnapshot(
  snapshot: ElementVisualSnapshot,
  options: ElementVisualGuardOptions = {},
): string[] {
  return collectElementVisualGuardFindings(snapshot, options).map((finding) => finding.message);
}

export function collectElementVisualGuardFindings(
  snapshot: ElementVisualSnapshot,
  options: ElementVisualGuardOptions = {},
): ElementVisualGuardFinding[] {
  if (!snapshot.exists) return [missingFinding(snapshot, options)];
  return [
    visibilityFinding(snapshot, options),
    viewportFinding(snapshot, options),
    clippingFinding(snapshot, options),
    hitTestFinding(snapshot, options),
    ...importantTextFindings(snapshot, options),
  ].filter((finding): finding is ElementVisualGuardFinding => finding !== null);
}

function missingFinding(
  snapshot: ElementVisualSnapshot,
  options: ElementVisualGuardOptions,
): ElementVisualGuardFinding {
  const label = labelFor(snapshot, options);
  return {
    code: "missing",
    label,
    message: `Element visual guard: "${label}" does not exist`,
    severity: "warn",
    details: { rect: null, viewport: snapshot.viewport },
  };
}

function visibilityFinding(
  snapshot: ElementVisualSnapshot,
  options: ElementVisualGuardOptions,
): ElementVisualGuardFinding | null {
  if (isElementVisible(snapshot)) return null;
  const label = labelFor(snapshot, options);
  return {
    code: "not-visible",
    label,
    message: `Element visual guard: "${label}" is not visible`,
    severity: "warn",
    details: {
      rect: snapshot.rect,
      viewport: snapshot.viewport,
      display: snapshot.display,
      visibility: snapshot.visibility,
      opacity: snapshot.opacity,
    },
  };
}

function viewportFinding(
  snapshot: ElementVisualSnapshot,
  options: ElementVisualGuardOptions,
): ElementVisualGuardFinding | null {
  if (isElementInViewport(snapshot)) return null;
  const label = labelFor(snapshot, options);
  return {
    code: "outside-viewport",
    label,
    message: `Element visual guard: "${label}" is outside the viewport`,
    severity: "warn",
    details: { rect: snapshot.rect, viewport: snapshot.viewport },
  };
}

function clippingFinding(
  snapshot: ElementVisualSnapshot,
  options: ElementVisualGuardOptions,
): ElementVisualGuardFinding | null {
  const minRatio = options.minVisibleRatio ?? DEFAULT_MIN_VISIBLE_RATIO;
  if (isElementNotClipped(snapshot, minRatio)) return null;
  const percent = Math.round(snapshot.visibleRatio * 100);
  const label = labelFor(snapshot, options);
  return {
    code: "clipped",
    label,
    message: `Element visual guard: "${label}" is clipped (${String(percent)}% visible)`,
    severity: "warn",
    details: {
      rect: snapshot.rect,
      viewport: snapshot.viewport,
      visibleRatio: snapshot.visibleRatio,
      minVisibleRatio: minRatio,
    },
  };
}

function hitTestFinding(
  snapshot: ElementVisualSnapshot,
  options: ElementVisualGuardOptions,
): ElementVisualGuardFinding | null {
  if (isCenterHitTestClear(snapshot)) return null;
  const blocker = formatDescriptor(snapshot.centerHitTest?.blocker);
  const label = labelFor(snapshot, options);
  return {
    code: "center-blocked",
    label,
    message: `Element visual guard: "${label}" center is blocked by ${blocker}`,
    severity: "warn",
    details: {
      rect: snapshot.rect,
      viewport: snapshot.viewport,
      blocker: snapshot.centerHitTest?.blocker ?? null,
    },
  };
}

function importantTextFindings(
  snapshot: ElementVisualSnapshot,
  options: ElementVisualGuardOptions,
): ElementVisualGuardFinding[] {
  return snapshot.importantText
    .filter((entry) => entry.found && entry.coveredByDemoMachineOverlay)
    .map((entry) => {
      const label = labelFor(snapshot, options);
      const overlay = formatDescriptor(entry.overlay);
      return {
        code: "important-text-covered",
        label,
        message: `Element visual guard: important text "${entry.text}" on "${label}" is covered by ${overlay}`,
        severity: "warn",
        details: {
          rect: snapshot.rect,
          viewport: snapshot.viewport,
          text: entry.text,
          textRect: entry.rect,
          overlay: entry.overlay,
        },
      };
    });
}

function normalizeImportantText(text: ElementVisualGuardOptions["importantText"]): string[] {
  if (!text) return [];
  return (Array.isArray(text) ? text : [text]).filter((value) => value.length > 0);
}

function labelFor(snapshot: ElementVisualSnapshot, options: ElementVisualGuardOptions): string {
  return options.label ?? snapshot.label;
}

function formatDescriptor(descriptor: ElementVisualDescriptor | null | undefined): string {
  if (!descriptor) return "an unknown element";
  const idPart = descriptor.id ? ` id="${descriptor.id}"` : "";
  const classPart = descriptor.className ? ` class="${descriptor.className}"` : "";
  return `<${descriptor.tag}${idPart}${classPart}> (z-index: ${descriptor.zIndex})`;
}
