import * as fs from "node:fs";
import * as path from "node:path";
import { registerCheck } from "../registry.js";
import { pass, fail } from "../types.js";
import type { CheckContext, CheckResult } from "../types.js";

interface FilesSpecShape {
  meta?: { branding?: { logo?: string } };
  chapters?: Array<{
    steps?: Array<{ action?: string; file?: string; files?: string[] }>;
  }>;
}

const CHECK_NAME = "spec-files";

function checkBrandingLogo(
  branding: { logo?: string } | undefined,
  specDir: string,
  results: CheckResult[],
): void {
  if (!branding || typeof branding.logo !== "string") return;
  const logoPath = path.resolve(specDir, branding.logo);
  if (!fs.existsSync(logoPath)) {
    results.push(
      fail(
        CHECK_NAME,
        `Branding logo not found: ${logoPath}`,
        "Check the logo path in meta.branding.logo",
      ),
    );
  }
}

function checkUploadFiles(
  step: { file?: string; files?: string[] },
  stepIndex: number,
  specDir: string,
  results: CheckResult[],
): void {
  const files: string[] = [];
  if (typeof step.file === "string") files.push(step.file);
  if (Array.isArray(step.files)) files.push(...step.files);
  for (const filePath of files) {
    const resolved = path.resolve(specDir, filePath);
    if (!fs.existsSync(resolved)) {
      results.push(
        fail(
          CHECK_NAME,
          `Step ${stepIndex} upload file not found: ${resolved}`,
          "Ensure upload files exist relative to the spec directory",
        ),
      );
    }
  }
}

function checkFiles(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const spec = ctx.spec as FilesSpecShape;

  checkBrandingLogo(spec.meta?.branding, ctx.specDir, results);

  const chapters = spec.chapters ?? [];
  let stepIndex = 0;
  for (const chapter of chapters) {
    for (const step of chapter.steps ?? []) {
      if (step.action === "upload") {
        checkUploadFiles(step, stepIndex, ctx.specDir, results);
      }
      stepIndex++;
    }
  }

  return results.length === 0 ? [pass(CHECK_NAME)] : results;
}

registerCheck({
  name: "spec-files",
  phase: "pre-capture",
  fn: checkFiles,
});
