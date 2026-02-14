/**
 * Generates CSS rules that blur and disable pointer events for the given selectors.
 */
export function generateBlurStyles(selectors: string[]): string {
  if (selectors.length === 0) {
    return "";
  }

  for (const selector of selectors) {
    if (/[{}]/.test(selector)) {
      throw new Error(`Invalid redaction selector (contains braces): ${selector}`);
    }
  }

  return selectors
    .map(
      (selector) =>
        `${selector} { filter: blur(10px) !important; pointer-events: none !important; }`,
    )
    .join("\n");
}
