import * as fs from "node:fs";
import * as path from "node:path";
import { registerCheck } from "../registry.js";
import { pass, fail } from "../types.js";
import type { CheckContext, CheckResult } from "../types.js";

function checkFiles(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const spec = ctx.spec as Record<string, unknown>;
  const meta = (spec.meta ?? {}) as Record<string, unknown>;
  const branding = meta.branding as Record<string, unknown> | undefined;
  const name = "spec-files";

  // Check branding logo
  if (branding && typeof branding.logo === "string") {
    const logoPath = path.resolve(ctx.specDir, branding.logo);
    if (!fs.existsSync(logoPath)) {
      results.push(
        fail(name, `Branding logo not found: ${logoPath}`, "Check the logo path in meta.branding.logo"),
      );
    }
  }

  // Check upload file references
  const chapters = (spec.chapters ?? []) as Array<Record<string, unknown>>;
  let stepIndex = 0;
  for (const chapter of chapters) {
    const steps = (chapter.steps ?? []) as Array<Record<string, unknown>>;
    for (const step of steps) {
      if (step.action === "upload") {
        const files: string[] = [];
        if (typeof step.file === "string") files.push(step.file);
        if (Array.isArray(step.files)) files.push(...(step.files as string[]));
        for (const filePath of files) {
          const resolved = path.resolve(ctx.specDir, filePath);
          if (!fs.existsSync(resolved)) {
            results.push(
              fail(
                name,
                `Step ${stepIndex} upload file not found: ${resolved}`,
                "Ensure upload files exist relative to the spec directory",
              ),
            );
          }
        }
      }
      stepIndex++;
    }
  }

  if (results.length === 0) {
    return [pass(name)];
  }
  return results;
}

registerCheck({
  name: "spec-files",
  phase: "pre-capture",
  fn: checkFiles,
});
