import type { ActionHandler } from "../action-core.js";
import { buildEvent } from "../action-core.js";
import * as path from "node:path";

function resolveScreenshotPath(name: string, outputDir: string | undefined): string {
  if (/[/\\]/.test(name)) {
    throw new Error(`Invalid screenshot name (path separators not allowed): ${name}`);
  }
  const ext = path.extname(name).toLowerCase();
  const safeExt = ext.length > 0 ? ext : ".png";
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(safeExt)) {
    throw new Error(`Unsupported screenshot extension "${safeExt}" for name "${name}"`);
  }
  const filename = ext.length > 0 ? name : `${name}.png`;
  return path.join(outputDir ?? process.cwd(), filename);
}

export const handleScreenshot: ActionHandler = async (ctx, step, events, stepIndex) => {
  const start = Date.now();
  if (step.action !== "screenshot") return;

  const options: { path?: string } = step.name
    ? { path: resolveScreenshotPath(step.name, ctx.outputDir) }
    : {};

  try {
    await ctx.page.screenshot(options);
  } catch (err) {
    throw new Error(
      `screenshot failed writing to "${options.path ?? "(inline)"}": ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  events.push(buildEvent({ action: "screenshot", startTime: start, narration: step.narration }));
  await ctx.waitAfterStep(stepIndex, step);
};
