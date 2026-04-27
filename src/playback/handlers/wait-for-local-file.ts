import { access, readFile } from "node:fs/promises";
import * as path from "node:path";
import type { ActionHandler } from "../action-core.js";
import { buildEvent, stepTimeoutMs } from "../action-core.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveLocalPath(ctx: Parameters<ActionHandler>[0], filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(ctx.specDir ?? process.cwd(), filePath);
}

async function fileMatches(filePath: string, contains: string | undefined): Promise<boolean> {
  if (contains === undefined) {
    await access(filePath);
    return true;
  }

  const text = await readFile(filePath, "utf8");
  return text.includes(contains);
}

function getLocalFilePaths(
  ctx: Parameters<ActionHandler>[0],
  step: Extract<Parameters<ActionHandler>[1], { action: "waitForLocalFile" }>,
): string[] {
  const rawPaths = step.paths ?? (step.path ? [step.path] : []);
  return rawPaths.map((p) => resolveLocalPath(ctx, p));
}

function allMatched(matches: boolean[]): boolean {
  return matches.every(Boolean);
}

function expectedContentError(contains: string | undefined): Error | undefined {
  return contains ? new Error(`Expected file contents to include "${contains}"`) : undefined;
}

function errorDetail(error: unknown): string {
  if (!(error instanceof Error) || error.message.length === 0) return "";
  return ` Last error: ${error.message}`;
}

interface LocalFileSuccessParams {
  ctx: Parameters<ActionHandler>[0];
  step: Extract<Parameters<ActionHandler>[1], { action: "waitForLocalFile" }>;
  events: Parameters<ActionHandler>[2];
  stepIndex: number;
  start: number;
  filePaths: string[];
}

async function emitSuccess(params: LocalFileSuccessParams): Promise<void> {
  params.events.push(
    buildEvent({
      action: "waitForLocalFile",
      startTime: params.start,
      selector: params.filePaths.join(", "),
      narration: params.step.narration,
    }),
  );
  await params.ctx.waitAfterStep(params.stepIndex, params.step);
}

export const handleWaitForLocalFile: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "waitForLocalFile") return;

  const filePaths = getLocalFilePaths(ctx, step);
  const timeoutMs = stepTimeoutMs(step);
  const pollingMs = step.pollingMs ?? 500;
  const deadline = start + timeoutMs;
  let lastError: unknown;

  while (Date.now() <= deadline) {
    try {
      const matches = await Promise.all(filePaths.map((p) => fileMatches(p, step.contains)));
      if (allMatched(matches)) {
        await emitSuccess({ ctx, step, events, stepIndex, start, filePaths });
        return;
      }
      lastError = expectedContentError(step.contains);
    } catch (err) {
      lastError = err;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollingMs, remainingMs));
  }

  const containsDetail = step.contains ? ` containing "${step.contains}"` : "";
  throw new Error(
    `Timed out after ${String(timeoutMs)}ms waiting for local file(s)${containsDetail}: ${filePaths.join(", ")}.${errorDetail(lastError)}`,
    { cause: lastError },
  );
};
