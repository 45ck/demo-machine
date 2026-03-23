import { registerCheck } from "../registry.js";
import { pass, warn } from "../types.js";
import type { CheckContext, CheckResult } from "../types.js";

const KNOWN_PROVIDERS = ["kokoro", "openai", "elevenlabs", "azure"];

interface NarrationConfig {
  enabled?: boolean;
  provider?: string;
}

interface NarrationSpecShape {
  narration?: NarrationConfig;
  chapters?: Array<{
    narration?: string;
    steps?: Array<{ narration?: string }>;
  }>;
}

interface NarrationOptsShape {
  narration?: boolean;
  ttsProvider?: string;
}

function hasAnyNarrationText(chapters: NarrationSpecShape["chapters"]): boolean {
  for (const chapter of chapters ?? []) {
    if (chapter.narration) return true;
    for (const step of chapter.steps ?? []) {
      if (step.narration) return true;
    }
  }
  return false;
}

function checkNarration(ctx: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  const spec = ctx.spec as NarrationSpecShape;
  const opts = (ctx["options"] ?? {}) as NarrationOptsShape;
  const name = "spec-narration";

  if (!opts.narration) {
    return [pass(name)];
  }

  const narrationConfig = spec.narration;
  if (narrationConfig?.enabled === false) {
    results.push(warn(name, "Narration disabled in spec but enabled via CLI"));
    return results;
  }

  if (!hasAnyNarrationText(spec.chapters)) {
    results.push(warn(name, "Narration is enabled but no steps or chapters have narration text"));
  }

  // Validate provider
  const provider: string | undefined = narrationConfig?.provider ?? opts.ttsProvider;
  if (provider && !KNOWN_PROVIDERS.includes(provider)) {
    results.push(warn(name, `Unknown TTS provider "${provider}"`));
  }

  return results.length === 0 ? [pass(name)] : results;
}

registerCheck({
  name: "spec-narration",
  phase: "pre-capture",
  fn: checkNarration,
});
