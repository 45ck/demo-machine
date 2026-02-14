import { describe, it, expect } from "vitest";
import { generateBlurStyles } from "../../src/redaction/mask.js";

describe("generateBlurStyles", () => {
  it("returns empty string for empty selectors array", () => {
    expect(generateBlurStyles([])).toBe("");
  });

  it("generates correct CSS rule for a single selector", () => {
    const css = generateBlurStyles([".secret-panel"]);
    expect(css).toContain(".secret-panel");
    expect(css).toContain("filter: blur(10px)");
    expect(css).toContain("pointer-events: none");
  });

  it("generates multiple CSS rules for multiple selectors", () => {
    const css = generateBlurStyles([".panel-a", "#sidebar", "[data-sensitive]"]);
    expect(css).toContain(".panel-a");
    expect(css).toContain("#sidebar");
    expect(css).toContain("[data-sensitive]");
  });

  it("includes both blur filter and pointer-events none with !important", () => {
    const css = generateBlurStyles(["div.info"]);
    expect(css).toMatch(/filter:\s*blur\(10px\)\s*!important/);
    expect(css).toMatch(/pointer-events:\s*none\s*!important/);
  });

  it("preserves special characters in selectors", () => {
    const selectors = ['input[type="password"]', ".class\\.with-dot", "#id > .child + .sibling"];
    const css = generateBlurStyles(selectors);
    for (const sel of selectors) {
      expect(css).toContain(sel);
    }
  });
});
