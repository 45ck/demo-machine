import { registerCheck } from "../registry.js";
import { pass, fail, warn } from "../types.js";
import type { CheckContext, CheckResult } from "../types.js";

const MAX_STEPS_PER_CHAPTER = 50;
const MAX_CHAPTERS = 20;

interface SpecWithChapters {
  chapters?: Array<{ title?: string; steps?: unknown[] }>;
}

function checkChapters(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const spec = ctx.spec as SpecWithChapters;
  const chapters = spec.chapters ?? [];
  const name = "spec-chapters";

  if (chapters.length === 0) {
    results.push(fail(name, "Spec has no chapters"));
    return results;
  }

  if (chapters.length > MAX_CHAPTERS) {
    results.push(
      warn(name, `Spec has ${chapters.length} chapters (max recommended: ${MAX_CHAPTERS})`),
    );
  }

  const titles = new Set<string>();
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]!;
    const title = chapter.title as string;
    const steps = chapter.steps ?? [];

    // Check for duplicate titles
    if (titles.has(title)) {
      results.push(warn(name, `Duplicate chapter title: "${title}"`));
    }
    titles.add(title);

    // Check step count
    if (steps.length === 0) {
      results.push(fail(name, `Chapter "${title}" has no steps`));
    } else if (steps.length > MAX_STEPS_PER_CHAPTER) {
      results.push(
        warn(
          name,
          `Chapter "${title}" has ${steps.length} steps (max recommended: ${MAX_STEPS_PER_CHAPTER})`,
        ),
      );
    }
  }

  if (results.length === 0) {
    return [pass(name)];
  }
  return results;
}

registerCheck({
  name: "spec-chapters",
  phase: "pre-capture",
  fn: checkChapters,
});
