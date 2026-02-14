import type { SecretMatch } from "./types.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("redaction");

export function scanForSecrets(text: string, patterns: string[]): SecretMatch[] {
  const matches: SecretMatch[] = [];

  for (const pattern of patterns) {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, "g");
    } catch {
      logger.warn(`Invalid regex pattern, skipping: ${pattern}`);
      continue;
    }

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      matches.push({ pattern, text: match[0] });
    }
  }

  return matches;
}
