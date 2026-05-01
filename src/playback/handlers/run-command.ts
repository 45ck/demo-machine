import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type { ActionHandler } from "../action-core.js";
import { buildEvent, stepTimeoutMs } from "../action-core.js";

function resolveWorkingDirectory(
  ctx: Parameters<ActionHandler>[0],
  cwd: string | undefined,
): string {
  if (cwd === undefined) return ctx.specDir ?? process.cwd();
  if (path.isAbsolute(cwd)) return cwd;
  return path.resolve(ctx.specDir ?? process.cwd(), cwd);
}

function logPath(
  ctx: Parameters<ActionHandler>[0],
  stepIndex: number,
  stream: "stdout" | "stderr",
): string | undefined {
  if (!ctx.outputDir) return undefined;
  return path.join(ctx.outputDir, "run-command", `step-${String(stepIndex)}.${stream}.log`);
}

async function writeLog(filePath: string | undefined, content: string): Promise<void> {
  if (!filePath) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

function preview(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 400 ? `${trimmed.slice(0, 400)}...` : trimmed;
}

export const handleRunCommand: ActionHandler = async (ctx, step, events, stepIndex) => {
  if (step.action !== "runCommand") return;

  const start = Date.now();
  const cwd = resolveWorkingDirectory(ctx, step.cwd);
  const timeoutMs = stepTimeoutMs(step);
  const stdoutPath = logPath(ctx, stepIndex, "stdout");
  const stderrPath = logPath(ctx, stepIndex, "stderr");

  let stdout = "";
  let stderr = "";

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(step.command, {
      cwd,
      shell: true,
      env: { ...process.env, ...(step.env ?? {}) },
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`runCommand timed out after ${String(timeoutMs)}ms: ${step.command}`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 0);
    });
  });

  await Promise.all([writeLog(stdoutPath, stdout), writeLog(stderrPath, stderr)]);

  if (exitCode !== 0) {
    throw new Error(
      [
        `runCommand exited with ${String(exitCode)}: ${step.command}`,
        stderr ? `stderr: ${preview(stderr)}` : undefined,
        stdout ? `stdout: ${preview(stdout)}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  events.push(
    buildEvent({
      action: "runCommand",
      startTime: start,
      selector: step.command,
      narration: step.narration,
    }),
  );
  await ctx.waitAfterStep(stepIndex, step);
};
