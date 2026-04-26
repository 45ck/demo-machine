import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  UsageError,
  collectReviewArtifacts,
  metaPrompt,
  needsShell,
  parseArgs,
  resolveCommand,
  scaffoldWorkspace,
  skillMarkdown,
  writeReviewPage,
} from "../../scripts/meta-prompt-qa.mjs";

describe("meta prompt QA options", () => {
  it("parses scaffold and codex execution options", () => {
    const opts = parseArgs([
      "--workspace-dir",
      "tmp/workspace",
      "--output-dir=tmp/out",
      "--run-codex",
      "--clean",
      "--skip-build",
      "--model",
      "demo-model",
      "--codex-cmd",
      "codex",
    ]);

    expect(opts).toMatchObject({
      workspaceDir: "tmp/workspace",
      outputDir: "tmp/out",
      runCodex: true,
      clean: true,
      build: false,
      model: "demo-model",
      codexCmd: "codex",
    });
  });

  it("rejects unknown and malformed options", () => {
    expect(() => parseArgs(["--unknown"])).toThrow(UsageError);
    expect(() => parseArgs(["--workspace-dir"])).toThrow(/Missing value/);
    expect(() => parseArgs(["--run-codex=true"])).toThrow(/does not accept/);
  });

  it("uses Windows shell execution for command shims", () => {
    if (process.platform !== "win32") {
      expect(needsShell("codex")).toBe(false);
      return;
    }

    expect(resolveCommand("codex")).toBe("codex.cmd");
    expect(needsShell("codex")).toBe(true);
  });
});

describe("meta prompt QA scaffold", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it("writes a fresh app, skill, and prompt that point at the local checkout", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "demo-machine-meta-"));
    const root = path.join(tempDir, "repo");
    const workspaceDir = path.join(tempDir, "qa", "workspace");
    const outputDir = path.join(tempDir, "qa");

    await scaffoldWorkspace({ root, workspaceDir, outputDir, clean: true });

    const skill = skillMarkdown({ root, workspaceDir });
    const prompt = metaPrompt({ root, workspaceDir, outputDir });

    expect(skill).toMatch(/^---\nname: demo-machine\n/);
    expect(skill).toContain(JSON.stringify(path.join(root, "dist", "cli.js")));
    expect(skill).toContain("--tts-provider kokoro");
    expect(skill).not.toContain("--no-narration` for each demo");
    expect(skill).toContain("Treat zoom/highlight as presentation only");
    expect(skill).toContain("confirm the event log contains one real click");
    expect(skill).toContain("SELF_EVALUATION.md");
    expect(prompt).toContain("Use the local skill first");
    expect(prompt).toContain("Do not use --no-narration");
    expect(prompt).toContain("dragAndDrop");
    expect(prompt).toContain("demo-machine-output/<demo-slug>");

    await expect(
      readFile(path.join(workspaceDir, ".codex", "skills", "demo-machine", "SKILL.md"), "utf8"),
    ).resolves.toContain("Demo Machine Skill");
    await expect(readFile(path.join(workspaceDir, "index.html"), "utf8")).resolves.toContain(
      "UX workbench",
    );
    await expect(
      readFile(path.join(workspaceDir, "assets", "sample-briefing.txt"), "utf8"),
    ).resolves.toContain("upload coverage");
  });

  it("collects generated specs and rendered demo artifacts for review", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "demo-machine-meta-"));
    const workspaceDir = path.join(tempDir, "workspace");
    const outputDir = path.join(tempDir, "review");
    const demoDir = path.join(workspaceDir, "demo-machine-output", "tour");

    await mkdir(path.join(workspaceDir, "demos"), { recursive: true });
    await mkdir(demoDir, { recursive: true });
    await writeFile(
      path.join(workspaceDir, "demos", "tour.demo.yaml"),
      "chapters:\n  - steps:\n      - action: navigate\n        narration: Tour\n",
    );
    await writeFile(path.join(demoDir, "output.mp4"), "video");
    await writeFile(path.join(demoDir, "quality.json"), JSON.stringify({ status: "pass" }));
    await writeFile(path.join(demoDir, "verification.json"), JSON.stringify({ status: "pass" }));
    await writeFile(path.join(demoDir, "events.json"), JSON.stringify([{ action: "navigate" }]));
    await writeFile(path.join(workspaceDir, "SELF_EVALUATION.md"), "# Self Evaluation\n");

    const report = await collectReviewArtifacts({ workspaceDir });
    const reviewPath = await writeReviewPage({ workspaceDir, outputDir, report });

    expect(report.specPaths).toHaveLength(1);
    expect(report.demos).toContainEqual(
      expect.objectContaining({
        slug: "tour",
        qualityStatus: "pass",
        verificationStatus: "pass",
        eventCount: 1,
        hasAudio: null,
      }),
    );
    expect(report.acceptance.status).toBe("fail");
    expect(report.acceptance.missingActions).toContain("dragAndDrop");
    await expect(readFile(reviewPath, "utf8")).resolves.toContain("tour");
  });
});
