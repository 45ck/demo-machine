import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkSecrets } from "../../src/playback/overlays.js";
import { scanForSecrets } from "../../src/redaction/secrets.js";
import type { PlaywrightPage } from "../../src/playback/playwright.js";

vi.mock("../../src/redaction/secrets.js", () => ({
  scanForSecrets: vi.fn(() => []),
}));

describe("checkSecrets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["DEMO_MACHINE_PUBLIC_SAFE"];
  });

  afterEach(() => {
    delete process.env["DEMO_MACHINE_PUBLIC_SAFE"];
  });

  it("scans page text with configured redaction selectors excluded", async () => {
    const page = {
      evaluate: vi.fn().mockResolvedValue("visible text"),
    } as unknown as PlaywrightPage;

    await checkSecrets(page, ["secret-[0-9]+"], [".secret-key"]);

    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), [".secret-key"]);
    expect(scanForSecrets).toHaveBeenCalledWith("visible text", ["secret-[0-9]+"]);
  });

  it("does not read the page when no secret patterns are configured", async () => {
    const page = {
      evaluate: vi.fn(),
    } as unknown as PlaywrightPage;

    await checkSecrets(page, [], [".secret-key"]);

    expect(page.evaluate).not.toHaveBeenCalled();
    expect(scanForSecrets).not.toHaveBeenCalled();
  });

  it("throws on secret matches in public-safe mode", async () => {
    process.env["DEMO_MACHINE_PUBLIC_SAFE"] = "true";
    vi.mocked(scanForSecrets).mockReturnValue([{ pattern: "secret-[0-9]+", text: "secret-123" }]);
    const page = {
      evaluate: vi.fn().mockResolvedValue("secret-123"),
    } as unknown as PlaywrightPage;

    await expect(checkSecrets(page, ["secret-[0-9]+"])).rejects.toThrow(
      "Public-safe capture blocked",
    );
  });
});
