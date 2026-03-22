import type { CheckContext } from "../types.js";

/** Extended context for post-capture checks. */
export interface CaptureCheckContext extends CheckContext {
  events: unknown[];
  outputDir: string;
}
