import { readdir, stat } from "node:fs/promises";
import * as path from "node:path";
import type { ActionHandler } from "../action-core.js";
import { buildEvent, stepTimeoutMs } from "../action-core.js";

interface DirectorySnapshot {
  fileCount: number;
  latestMtimeMs: number;
  totalSize: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveLocalPath(ctx: Parameters<ActionHandler>[0], filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(ctx.specDir ?? process.cwd(), filePath);
}

async function snapshotDirectory(dir: string): Promise<DirectorySnapshot> {
  const entries = await readdir(dir, { withFileTypes: true });
  let fileCount = 0;
  let latestMtimeMs = 0;
  let totalSize = 0;

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const child = await snapshotDirectory(fullPath);
      fileCount += child.fileCount;
      latestMtimeMs = Math.max(latestMtimeMs, child.latestMtimeMs);
      totalSize += child.totalSize;
      continue;
    }

    if (!entry.isFile()) continue;
    const fileStat = await stat(fullPath);
    fileCount += 1;
    latestMtimeMs = Math.max(latestMtimeMs, fileStat.mtimeMs);
    totalSize += fileStat.size;
  }

  return { fileCount, latestMtimeMs, totalSize };
}

function signature(snapshot: DirectorySnapshot): string {
  return `${String(snapshot.fileCount)}:${String(snapshot.latestMtimeMs)}:${String(snapshot.totalSize)}`;
}

function isEligible(snapshot: DirectorySnapshot, minFiles: number): boolean {
  return snapshot.fileCount >= minFiles;
}

function shouldResetStableSince(
  snapshot: DirectorySnapshot,
  currentSignature: string,
  lastSignature: string | undefined,
  minFiles: number,
): boolean {
  return !isEligible(snapshot, minFiles) || currentSignature !== lastSignature;
}

function nextStableSince(snapshot: DirectorySnapshot, minFiles: number): number | undefined {
  return isEligible(snapshot, minFiles) ? Date.now() : undefined;
}

function isStableEnough(stableSince: number | undefined, stableMs: number): boolean {
  return stableSince !== undefined && Date.now() - stableSince >= stableMs;
}

function errorDetail(error: unknown): string {
  if (!(error instanceof Error) || error.message.length === 0) return "";
  return ` Last error: ${error.message}`;
}

interface DirectoryStableSuccessParams {
  ctx: Parameters<ActionHandler>[0];
  step: Extract<Parameters<ActionHandler>[1], { action: "waitForLocalDirectoryStable" }>;
  events: Parameters<ActionHandler>[2];
  stepIndex: number;
  start: number;
  dir: string;
}

async function emitSuccess(params: DirectoryStableSuccessParams): Promise<void> {
  params.events.push(
    buildEvent({
      action: "waitForLocalDirectoryStable",
      startTime: params.start,
      selector: params.dir,
      narration: params.step.narration,
    }),
  );
  await params.ctx.waitAfterStep(params.stepIndex, params.step);
}

export const handleWaitForLocalDirectoryStable: ActionHandler = async (
  ctx,
  step,
  events,
  stepIndex,
) => {
  const start = Date.now();
  if (step.action !== "waitForLocalDirectoryStable") return;

  const dir = resolveLocalPath(ctx, step.path);
  const timeoutMs = stepTimeoutMs(step);
  const pollingMs = step.pollingMs ?? 1000;
  const stableMs = step.stableMs ?? 15000;
  const minFiles = step.minFiles ?? 1;
  const deadline = start + timeoutMs;
  let stableSince: number | undefined;
  let lastSignature: string | undefined;
  let lastError: unknown;

  while (Date.now() <= deadline) {
    try {
      const snapshot = await snapshotDirectory(dir);
      const currentSignature = signature(snapshot);

      if (shouldResetStableSince(snapshot, currentSignature, lastSignature, minFiles)) {
        stableSince = nextStableSince(snapshot, minFiles);
        lastSignature = currentSignature;
      } else if (isStableEnough(stableSince, stableMs)) {
        await emitSuccess({ ctx, step, events, stepIndex, start, dir });
        return;
      }
    } catch (err) {
      stableSince = undefined;
      lastSignature = undefined;
      lastError = err;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollingMs, remainingMs));
  }

  throw new Error(
    `Timed out after ${String(timeoutMs)}ms waiting for local directory to be stable for ${String(stableMs)}ms with at least ${String(minFiles)} file(s): ${dir}.${errorDetail(lastError)}`,
    { cause: lastError },
  );
};
