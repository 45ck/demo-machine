import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkSecrets } from "../../src/playback/overlays.js";
import { scanForSecrets } from "../../src/redaction/secrets.js";
import type { PlaywrightPage } from "../../src/playback/playwright.js";

vi.mock("../../src/redaction/secrets.js", () => ({
  scanForSecrets: vi.fn(() => []),
}));

describe("checkSecrets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
