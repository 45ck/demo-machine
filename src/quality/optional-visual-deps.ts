import { createRequire } from "node:module";

export interface PngImage {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface PngStatic {
  sync: { read: (buf: Buffer) => PngImage };
}

export type PixelmatchFn = (
  img1: Uint8Array,
  img2: Uint8Array,
  output: null,
  width: number,
  height: number,
  options: { threshold: number },
) => number;

class OptionalVisualDependencyError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "OptionalVisualDependencyError";
  }
}

const require = createRequire(import.meta.url);

export function isOptionalVisualDependencyError(
  err: unknown,
): err is OptionalVisualDependencyError {
  return err instanceof OptionalVisualDependencyError;
}

export function loadPng(): PngStatic {
  try {
    return (require("pngjs") as { PNG: PngStatic }).PNG;
  } catch (err) {
    throw new OptionalVisualDependencyError(
      "PNG checks require optional package 'pngjs'. Install it to use screenshot quality checks.",
      err,
    );
  }
}

export function loadVisualDiffDeps(): { PNG: PngStatic; pixelmatch: PixelmatchFn } {
  try {
    const { PNG } = require("pngjs") as { PNG: PngStatic };
    const loadedPixelmatch = require("pixelmatch") as PixelmatchFn | { default: PixelmatchFn };
    const pixelmatch =
      typeof loadedPixelmatch === "function" ? loadedPixelmatch : loadedPixelmatch.default;
    return { PNG, pixelmatch };
  } catch (err) {
    throw new OptionalVisualDependencyError(
      "PNG visual diff support requires optional packages 'pngjs' and 'pixelmatch'. Install them to use image comparison checks.",
      err,
    );
  }
}
