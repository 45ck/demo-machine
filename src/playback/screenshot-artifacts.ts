import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScreenshotCollectorResults } from "./screenshot-collector.js";

interface ScreenshotFileEntry {
  stepIndex?: number;
  chapterIndex?: number;
  path: string;
}

interface AssertScreenshotFileEntry {
  stepIndex: number;
  beforePath: string;
  afterPath: string;
}

export interface ScreenshotArtifactManifest {
  schemaVersion: 1;
  createdAt: string;
  counts: {
    stepScreenshots: number;
    assertScreenshotPairs: number;
    cursorPositions: number;
    chapterTitleScreenshots: number;
  };
  stepScreenshots: ScreenshotFileEntry[];
  assertScreenshotPairs: AssertScreenshotFileEntry[];
  cursorPositions: ScreenshotCollectorResults["cursorPositions"];
  chapterTitleScreenshots: ScreenshotFileEntry[];
}

export interface ScreenshotArtifactWriteResult {
  manifestPath: string;
  screenshotPaths: string[];
  manifest: ScreenshotArtifactManifest;
}

function padIndex(value: number): string {
  return String(value).padStart(4, "0");
}

function hasEvidence(
  results: ScreenshotCollectorResults | undefined,
): results is ScreenshotCollectorResults {
  return Boolean(
    results &&
    (results.stepScreenshots.size > 0 ||
      results.assertScreenshotPairs.length > 0 ||
      results.cursorPositions.length > 0 ||
      results.chapterTitleScreenshots.size > 0),
  );
}

async function writeSortedMapScreenshots(params: {
  screenshots: Map<number, Buffer>;
  outputDir: string;
  makeName: (index: number) => string;
  makeEntry: (index: number, path: string) => ScreenshotFileEntry;
}): Promise<{ entries: ScreenshotFileEntry[]; paths: string[] }> {
  const entries: ScreenshotFileEntry[] = [];
  const paths: string[] = [];
  const indices = [...params.screenshots.keys()].sort((a, b) => a - b);

  for (const index of indices) {
    const buffer = params.screenshots.get(index);
    if (!buffer) continue;
    const filePath = join(params.outputDir, params.makeName(index));
    await writeFile(filePath, buffer);
    entries.push(params.makeEntry(index, filePath));
    paths.push(filePath);
  }

  return { entries, paths };
}

export async function writeScreenshotArtifacts(params: {
  outputDir: string;
  results: ScreenshotCollectorResults | undefined;
}): Promise<ScreenshotArtifactWriteResult | undefined> {
  if (!hasEvidence(params.results)) return undefined;

  const screenshotDir = join(params.outputDir, "screenshots");
  await mkdir(screenshotDir, { recursive: true });

  const step = await writeSortedMapScreenshots({
    screenshots: params.results.stepScreenshots,
    outputDir: screenshotDir,
    makeName: (index) => `step-${padIndex(index)}.png`,
    makeEntry: (index, path) => ({ stepIndex: index, path }),
  });

  const chapter = await writeSortedMapScreenshots({
    screenshots: params.results.chapterTitleScreenshots,
    outputDir: screenshotDir,
    makeName: (index) => `chapter-${padIndex(index)}-title.png`,
    makeEntry: (index, path) => ({ chapterIndex: index, path }),
  });

  const assertScreenshotPairs: AssertScreenshotFileEntry[] = [];
  const assertPaths: string[] = [];
  for (const pair of params.results.assertScreenshotPairs) {
    const prefix = `assert-${padIndex(pair.stepIndex)}`;
    const beforePath = join(screenshotDir, `${prefix}-before.png`);
    const afterPath = join(screenshotDir, `${prefix}-after.png`);
    await writeFile(beforePath, pair.before);
    await writeFile(afterPath, pair.after);
    assertScreenshotPairs.push({ stepIndex: pair.stepIndex, beforePath, afterPath });
    assertPaths.push(beforePath, afterPath);
  }

  const manifest: ScreenshotArtifactManifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    counts: {
      stepScreenshots: step.entries.length,
      assertScreenshotPairs: assertScreenshotPairs.length,
      cursorPositions: params.results.cursorPositions.length,
      chapterTitleScreenshots: chapter.entries.length,
    },
    stepScreenshots: step.entries,
    assertScreenshotPairs,
    cursorPositions: [...params.results.cursorPositions],
    chapterTitleScreenshots: chapter.entries,
  };

  const manifestPath = join(screenshotDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  return {
    manifestPath,
    screenshotPaths: [...step.paths, ...assertPaths, ...chapter.paths],
    manifest,
  };
}

export function validateScreenshotArtifactManifestConsistency(params: {
  manifest: ScreenshotArtifactManifest;
  screenshotPaths: string[];
}): string[] {
  const issues: string[] = [];
  const listedPaths = manifestScreenshotPaths(params.manifest);

  checkCount(
    "stepScreenshots",
    params.manifest.counts.stepScreenshots,
    params.manifest.stepScreenshots.length,
    issues,
  );
  checkCount(
    "assertScreenshotPairs",
    params.manifest.counts.assertScreenshotPairs,
    params.manifest.assertScreenshotPairs.length,
    issues,
  );
  checkCount(
    "cursorPositions",
    params.manifest.counts.cursorPositions,
    params.manifest.cursorPositions.length,
    issues,
  );
  checkCount(
    "chapterTitleScreenshots",
    params.manifest.counts.chapterTitleScreenshots,
    params.manifest.chapterTitleScreenshots.length,
    issues,
  );

  const expectedPaths = new Set(listedPaths);
  const actualPaths = new Set(params.screenshotPaths);
  for (const path of expectedPaths) {
    if (!actualPaths.has(path)) issues.push(`Manifest path missing from screenshotPaths: ${path}`);
  }
  for (const path of actualPaths) {
    if (!expectedPaths.has(path))
      issues.push(`screenshotPaths entry missing from manifest: ${path}`);
  }

  return issues;
}

function manifestScreenshotPaths(manifest: ScreenshotArtifactManifest): string[] {
  return [
    ...manifest.stepScreenshots.map((entry) => entry.path),
    ...manifest.assertScreenshotPairs.flatMap((entry) => [entry.beforePath, entry.afterPath]),
    ...manifest.chapterTitleScreenshots.map((entry) => entry.path),
  ];
}

function checkCount(label: string, expected: number, actual: number, issues: string[]): void {
  if (expected === actual) return;
  issues.push(
    `${label} count mismatch: counts.${label}=${String(expected)}, entries=${String(actual)}`,
  );
}
