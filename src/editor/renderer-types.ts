import type { DemoSpec } from "../spec/types.js";

export interface RenderArgs {
  spec: DemoSpec;
  outFile: string;
  tempDir: string;
  assetsDir: string;
}

export interface RenderResult {
  outFile: string;
  durationMs?: number | undefined;
}

export interface Renderer {
  id: string;
  render(args: RenderArgs): Promise<RenderResult>;
}
