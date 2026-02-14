import { describe, it, expect, vi } from "vitest";
import { scanForSecrets } from "../../src/redaction/secrets.js";

describe("scanForSecrets", () => {
  it("returns empty array when no patterns provided", () => {
    const result = scanForSecrets("some text content", []);
    expect(result).toEqual([]);
  });

  it("finds matching patterns in text", () => {
    const text = "my email is user@example.com and my key is AKIA1234567890ABCDEF";
    const patterns = ["[\\w.+-]+@[\\w-]+\\.[\\w.]+", "AKIA[A-Z0-9]{16}"];
    const result = scanForSecrets(text, patterns);

    expect(result).toContainEqual({
      pattern: "[\\w.+-]+@[\\w-]+\\.[\\w.]+",
      text: "user@example.com",
    });
    expect(result).toContainEqual({
      pattern: "AKIA[A-Z0-9]{16}",
      text: "AKIA1234567890ABCDEF",
    });
  });

  it("returns empty array for non-matching patterns", () => {
    const result = scanForSecrets("hello world", ["\\d{16}", "AKIA[A-Z0-9]{16}"]);
    expect(result).toEqual([]);
  });

  it("handles invalid regex gracefully without throwing", () => {
    const warnSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(() => {
      scanForSecrets("test text", ["[invalid(", "valid-pattern"]);
    }).not.toThrow();

    warnSpy.mockRestore();
  });

  it("returns multiple matches for a single pattern", () => {
    const text = "token AAA111 and token BBB222 found";
    const result = scanForSecrets(text, ["[A-Z]{3}\\d{3}"]);

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ pattern: "[A-Z]{3}\\d{3}", text: "AAA111" });
    expect(result).toContainEqual({ pattern: "[A-Z]{3}\\d{3}", text: "BBB222" });
  });
});
