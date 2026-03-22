import { registerCheck } from "../registry.js";
import { pass, warn } from "../types.js";
import type { CheckContext, CheckResult } from "../types.js";

const KNOWN_PROVIDERS = ["kokoro", "openai", "elevenlabs", "azure"];

function checkNarration(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const spec = ctx.spec as Record<string, unknown>;
  const opts = ctx.options ?? {};
  const name = "spec-narration";

  if (!opts.narration) {
    return [pass(name)];
  }

  const narrationConfig = spec.narration as Record<string, unknown> | undefined;
  if (narrationConfig?.enabled === false) {
    results.push(warn(name, "Narration disabled in spec but enabled via CLI"));
    return results;
  }

  // Check if any steps have narration text
  let hasNarration = false;
  const chapters = (spec.chapters ?? []) as Array<Record<string, unknown>>;
  for (const chapter of chapters) {
    if (chapter.narration) {
      hasNarration = true;
      break;
    }
    const steps = (chapter.steps ?? []) as Array<Record<string, unknown>>;
    for (const step of steps) {
      if (step.narration) {
        hasNarration = true;
        break;
      }
    }
    if (hasNarration) break;
  }

  if (!hasNarration) {
    results.push(
      warn(name, "Narration is enabled but no steps or chapters have narration text"),
    );
  }

  // Validate provider
  const provider = (narrationConfig?.provider ?? opts.ttsProvider) as string | undefined;
  if (provider && !KNOWN_PROVIDERS.includes(provider)) {
    results.push(warn(name, `Unknown TTS provider "${provider}"`));
  }

  if (results.length === 0) {
    return [pass(name)];
  }
  return results;
}

registerCheck({
  name: "spec-narration",
  phase: "pre-capture",
  fn: checkNarration,
});
