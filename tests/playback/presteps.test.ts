import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runPreSteps } from "../../src/playback/presteps.js";
import type { PlaywrightPage } from "../../src/playback/playwright.js";

function createMockPage(): PlaywrightPage {
  const mockContext = {
    addCookies: vi.fn().mockResolvedValue(undefined),
  };
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    goBack: vi.fn().mockResolvedValue(null),
    goForward: vi.fn().mockResolvedValue(null),
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
    },
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn().mockReturnValue({
      nth: vi.fn().mockReturnThis(),
      click: vi.fn().mockResolvedValue(undefined),
      hover: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      setChecked: vi.fn().mockResolvedValue(undefined),
      selectOption: vi.fn().mockResolvedValue(undefined),
      setInputFiles: vi.fn().mockResolvedValue(undefined),
      dragTo: vi.fn().mockResolvedValue(undefined),
      isVisible: vi.fn().mockResolvedValue(true),
      textContent: vi.fn().mockResolvedValue(""),
      boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 100, height: 50 }),
      scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      waitFor: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(undefined),
    }),
    getByRole: vi.fn().mockReturnValue({} as never),
    getByText: vi.fn().mockReturnValue({} as never),
    getByTestId: vi.fn().mockReturnValue({} as never),
    getByLabel: vi.fn().mockReturnValue({} as never),
    getByPlaceholder: vi.fn().mockReturnValue({} as never),
    getByAltText: vi.fn().mockReturnValue({} as never),
    getByTitle: vi.fn().mockReturnValue({} as never),
    evaluate: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("")),
    addStyleTag: vi.fn().mockResolvedValue(undefined),
    context: vi.fn(() => mockContext),
  };
}

function mockFetchOk(body: unknown, contentType = "application/json"): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": contentType }),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(typeof body === "string" ? body : JSON.stringify(body)),
  });
}

function mockFetchFail(status: number, body = "error"): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    headers: new Headers({}),
    json: vi.fn().mockRejectedValue(new Error("not json")),
    text: vi.fn().mockResolvedValue(body),
  });
}

describe("runPreSteps", () => {
  let page: PlaywrightPage;
  const baseUrl = "https://example.com";

  beforeEach(() => {
    page = createMockPage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when preSteps is undefined", async () => {
    await runPreSteps({ page, baseUrl, preSteps: undefined });
    expect(page.goto).not.toHaveBeenCalled();
  });

  it("does nothing when preSteps is an empty array", async () => {
    await runPreSteps({ page, baseUrl, preSteps: [] });
    expect(page.goto).not.toHaveBeenCalled();
  });

  describe("httpRequest", () => {
    it("performs a GET request to the correct URL", async () => {
      const fetchMock = mockFetchOk({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      await runPreSteps({
        page,
        baseUrl,
        preSteps: [{ action: "httpRequest", url: "/api/health" }],
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        "https://example.com/api/health",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("auto-adds Content-Type header for POST with object body", async () => {
      const fetchMock = mockFetchOk({ id: 1 });
      vi.stubGlobal("fetch", fetchMock);

      await runPreSteps({
        page,
        baseUrl,
        preSteps: [
          {
            action: "httpRequest",
            method: "POST",
            url: "/api/data",
            body: { key: "value" },
          },
        ],
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers["content-type"]).toBe("application/json");
      expect(init.body).toBe(JSON.stringify({ key: "value" }));
    });

    it("does not override existing Content-Type header", async () => {
      const fetchMock = mockFetchOk({});
      vi.stubGlobal("fetch", fetchMock);

      await runPreSteps({
        page,
        baseUrl,
        preSteps: [
          {
            action: "httpRequest",
            method: "POST",
            url: "/api/data",
            headers: { "Content-Type": "text/plain" },
            body: { key: "value" },
          },
        ],
      });

      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("text/plain");
      expect(headers["content-type"]).toBeUndefined();
    });

    it("throws on non-ok status", async () => {
      const fetchMock = mockFetchFail(500, "Internal Server Error");
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        runPreSteps({
          page,
          baseUrl,
          preSteps: [{ action: "httpRequest", url: "/api/fail" }],
        }),
      ).rejects.toThrow(/status 500/);
    });

    it("succeeds when expectStatus matches response status", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockResolvedValue({ id: 1 }),
        text: vi.fn().mockResolvedValue('{"id":1}'),
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        runPreSteps({
          page,
          baseUrl,
          preSteps: [
            {
              action: "httpRequest",
              url: "/api/create",
              method: "POST",
              body: {},
              expectStatus: 201,
            },
          ],
        }),
      ).resolves.toBeUndefined();
    });

    it("throws when expectStatus does not match response status", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({}),
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue("ok"),
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        runPreSteps({
          page,
          baseUrl,
          preSteps: [
            {
              action: "httpRequest",
              url: "/api/create",
              method: "POST",
              body: {},
              expectStatus: 201,
            },
          ],
        }),
      ).rejects.toThrow(/status 200/);
    });

    it("saves parsed JSON response to state via saveResponseAs", async () => {
      const fetchMock = mockFetchOk({ token: "abc123" });
      vi.stubGlobal("fetch", fetchMock);

      const addCookies = (page.context() as { addCookies: ReturnType<typeof vi.fn> }).addCookies;

      await runPreSteps({
        page,
        baseUrl,
        preSteps: [
          {
            action: "httpRequest",
            method: "POST",
            url: "/api/login",
            body: { user: "test" },
            saveResponseAs: "loginResponse",
          },
          {
            action: "setCookie",
            name: "session",
            valueFrom: { source: "loginResponse", path: "token" },
          },
        ],
      });

      expect(addCookies).toHaveBeenCalledWith([
        expect.objectContaining({ name: "session", value: "abc123" }),
      ]);
    });
  });

  describe("setCookie", () => {
    it("calls addCookies with correct cookie fields from a direct value", async () => {
      const addCookies = (page.context() as { addCookies: ReturnType<typeof vi.fn> }).addCookies;

      await runPreSteps({
        page,
        baseUrl,
        preSteps: [
          {
            action: "setCookie",
            name: "theme",
            value: "dark",
            domain: ".example.com",
            path: "/",
            secure: true,
            httpOnly: true,
            sameSite: "Lax" as const,
          },
        ],
      });

      expect(addCookies).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "theme",
          value: "dark",
          domain: ".example.com",
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "Lax",
        }),
      ]);
    });

    it("resolves value from state via valueFrom with array index path", async () => {
      const fetchMock = mockFetchOk({ users: [{ name: "Alice" }, { name: "Bob" }] });
      vi.stubGlobal("fetch", fetchMock);

      const addCookies = (page.context() as { addCookies: ReturnType<typeof vi.fn> }).addCookies;

      await runPreSteps({
        page,
        baseUrl,
        preSteps: [
          {
            action: "httpRequest",
            url: "/api/users",
            saveResponseAs: "resp",
          },
          {
            action: "setCookie",
            name: "firstUser",
            valueFrom: { source: "resp", path: "users.0.name" },
          },
        ],
      });

      expect(addCookies).toHaveBeenCalledWith([
        expect.objectContaining({ name: "firstUser", value: "Alice" }),
      ]);
    });

    it("resolves value from state via valueFrom", async () => {
      const fetchMock = mockFetchOk({ data: { sessionId: "xyz789" } });
      vi.stubGlobal("fetch", fetchMock);

      const addCookies = (page.context() as { addCookies: ReturnType<typeof vi.fn> }).addCookies;

      await runPreSteps({
        page,
        baseUrl,
        preSteps: [
          {
            action: "httpRequest",
            url: "/api/session",
            saveResponseAs: "sessionResp",
          },
          {
            action: "setCookie",
            name: "sid",
            valueFrom: { source: "sessionResp", path: "data.sessionId" },
          },
        ],
      });

      expect(addCookies).toHaveBeenCalledWith([
        expect.objectContaining({ name: "sid", value: "xyz789" }),
      ]);
    });

    it("throws when both value and valueFrom are missing", async () => {
      await expect(
        runPreSteps({
          page,
          baseUrl,
          preSteps: [
            {
              action: "setCookie",
              name: "broken",
            } as never,
          ],
        }),
      ).rejects.toThrow("Missing value and valueFrom");
    });

    it("defaults cookie url to baseUrl when no url or domain provided", async () => {
      const addCookies = (page.context() as { addCookies: ReturnType<typeof vi.fn> }).addCookies;

      await runPreSteps({
        page,
        baseUrl,
        preSteps: [
          {
            action: "setCookie",
            name: "simple",
            value: "val",
          },
        ],
      });

      expect(addCookies).toHaveBeenCalledWith([
        expect.objectContaining({ name: "simple", value: "val", url: baseUrl }),
      ]);
    });
  });

  describe("setLocalStorage", () => {
    it("navigates to origin and calls evaluate with key/value", async () => {
      await runPreSteps({
        page,
        baseUrl,
        preSteps: [
          {
            action: "setLocalStorage",
            key: "authToken",
            value: "tok_123",
          },
        ],
      });

      expect(page.goto).toHaveBeenCalledWith("https://example.com", expect.anything());
      expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), {
        key: "authToken",
        value: "tok_123",
      });
    });
  });

  describe("unknown action", () => {
    it("throws on unsupported preStep action", async () => {
      await expect(
        runPreSteps({
          page,
          baseUrl,
          preSteps: [{ action: "unknownAction" } as never],
        }),
      ).rejects.toThrow(/Unsupported preStep action/);
    });
  });
});
