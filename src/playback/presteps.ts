import type { DemoSpec } from "../spec/types.js";
import type { PlaywrightPage } from "./playwright.js";
import { createLogger } from "../utils/logger.js";

type PreStep = NonNullable<DemoSpec["preSteps"]>[number];
type PreStepState = Record<string, unknown>;

const logger = createLogger("playback:presteps");
const JSON_CONTENT_TYPE = "application/json";
const HEADER_CONTENT_TYPE = "content-type";

function resolveUrl(url: string, baseUrl: string): string {
  return new URL(url, baseUrl).toString();
}

function readPath(source: unknown, path: string): unknown {
  const parts = path.split(".").filter((p) => p.length > 0);
  let cur: unknown = source;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(part);
      if (!Number.isNaN(idx) && Number.isInteger(idx) && idx >= 0) {
        cur = cur[idx];
        continue;
      }
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function stringifyValueForStorage(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value === null) return "null";
  return JSON.stringify(value);
}

function resolveValue(
  step: {
    value?: string | undefined;
    valueFrom?: { source: string; path?: string | undefined } | undefined;
  },
  state: PreStepState,
): string {
  if (step.value !== undefined) return step.value;
  if (!step.valueFrom) {
    throw new Error("Missing value and valueFrom");
  }

  const sourceValue = state[step.valueFrom.source];
  if (sourceValue === undefined) {
    throw new Error(`preSteps valueFrom source "${step.valueFrom.source}" was not found`);
  }

  const resolved =
    step.valueFrom.path !== undefined ? readPath(sourceValue, step.valueFrom.path) : sourceValue;
  if (resolved === undefined) {
    throw new Error(
      `preSteps valueFrom path "${step.valueFrom.path ?? "<root>"}" was not found in "${step.valueFrom.source}"`,
    );
  }
  return stringifyValueForStorage(resolved);
}

function statusMatches(
  status: number,
  expectStatus: number | number[] | undefined,
  ok: boolean,
): boolean {
  if (expectStatus === undefined) return ok;
  if (typeof expectStatus === "number") return status === expectStatus;
  return expectStatus.includes(status);
}

function ensureJsonContentType(headers: Record<string, string>): void {
  const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === "content-type");
  if (!hasContentType) {
    headers[HEADER_CONTENT_TYPE] = JSON_CONTENT_TYPE;
  }
}

function createRequestInit(step: Extract<PreStep, { action: "httpRequest" }>): RequestInit {
  const headers = { ...(step.headers ?? {}) };
  const init: RequestInit = { method: step.method ?? "GET", headers };
  if (step.body === undefined) return init;

  if (typeof step.body === "string") {
    init.body = step.body;
    return init;
  }

  ensureJsonContentType(headers);
  init.body = JSON.stringify(step.body);
  return init;
}

async function saveResponseToState(
  response: Response,
  key: string,
  state: PreStepState,
): Promise<void> {
  const contentType = response.headers.get(HEADER_CONTENT_TYPE) ?? "";
  if (contentType.includes(JSON_CONTENT_TYPE)) {
    state[key] = (await response.json()) as unknown;
    return;
  }
  state[key] = await response.text();
}

async function runHttpRequest(
  step: Extract<PreStep, { action: "httpRequest" }>,
  params: {
    baseUrl: string;
    state: PreStepState;
  },
): Promise<void> {
  const url = resolveUrl(step.url, params.baseUrl);
  const init = createRequestInit(step);
  const method = step.method ?? "GET";

  logger.info(`preStep httpRequest ${method} ${url}`);
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });

  if (!statusMatches(response.status, step.expectStatus, response.ok)) {
    const bodyPreview = (await response.text()).slice(0, 300);
    throw new Error(
      `preStep httpRequest failed (${method} ${url}) with status ${String(response.status)}: ${bodyPreview}`,
    );
  }

  if (step.saveResponseAs) {
    await saveResponseToState(response, step.saveResponseAs, params.state);
  }
}

function buildCookie(
  step: Extract<PreStep, { action: "setCookie" }>,
  value: string,
  baseUrl: string,
): {
  name: string;
  value: string;
  url?: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  expires?: number;
} {
  const cookie: {
    name: string;
    value: string;
    url?: string;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    expires?: number;
  } = {
    name: step.name,
    value,
  };

  if (step.url) cookie.url = resolveUrl(step.url, baseUrl);
  if (step.domain) cookie.domain = step.domain;
  if (step.path) cookie.path = step.path;
  if (step.secure !== undefined) cookie.secure = step.secure;
  if (step.httpOnly !== undefined) cookie.httpOnly = step.httpOnly;
  if (step.sameSite !== undefined) cookie.sameSite = step.sameSite;
  if (step.expires !== undefined) cookie.expires = step.expires;

  if (!cookie.url && !cookie.domain) cookie.url = baseUrl;
  return cookie;
}

async function runSetCookie(
  step: Extract<PreStep, { action: "setCookie" }>,
  params: {
    page: PlaywrightPage;
    baseUrl: string;
    state: PreStepState;
  },
): Promise<void> {
  const value = resolveValue(step, params.state);
  const cookie = buildCookie(step, value, params.baseUrl);
  logger.info(`preStep setCookie ${step.name}`);
  await params.page.context().addCookies([cookie]);
}

async function runSetLocalStorage(
  step: Extract<PreStep, { action: "setLocalStorage" }>,
  params: { page: PlaywrightPage; baseUrl: string; state: PreStepState },
): Promise<void> {
  const value = resolveValue(step, params.state);
  const target = resolveUrl(step.origin ?? params.baseUrl, params.baseUrl);
  const origin = new URL(target).origin;

  logger.info(`preStep setLocalStorage ${step.key} @ ${origin}`);
  await params.page.goto(origin, { waitUntil: "domcontentloaded", timeout: 15000 });
  await params.page.evaluate(
    ((payload: { key: string; value: string }) => {
      window.localStorage.setItem(payload.key, payload.value);
    }) as (...args: unknown[]) => unknown,
    { key: step.key, value } as unknown,
  );
}

export async function runPreSteps(params: {
  page: PlaywrightPage;
  baseUrl: string;
  preSteps?: DemoSpec["preSteps"];
}): Promise<void> {
  const steps = params.preSteps ?? [];
  if (steps.length === 0) return;

  logger.info(`Running ${String(steps.length)} preStep(s)`);
  const state: PreStepState = {};

  for (const step of steps) {
    switch (step.action) {
      case "httpRequest":
        await runHttpRequest(step, { baseUrl: params.baseUrl, state });
        break;
      case "setCookie":
        await runSetCookie(step, { page: params.page, baseUrl: params.baseUrl, state });
        break;
      case "setLocalStorage":
        await runSetLocalStorage(step, { page: params.page, baseUrl: params.baseUrl, state });
        break;
      default: {
        const exhaustive: never = step;
        throw new Error(`Unsupported preStep action: ${JSON.stringify(exhaustive)}`);
      }
    }
  }
}
