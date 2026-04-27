import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkGalleryConsistency,
  checkPackageReadiness,
  checkShowcaseAssets,
} from "../../scripts/release-gates.mjs";

describe("release gallery gates", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  async function writeJson(relativePath: string, value: unknown) {
    const filePath = join(tempDir!, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  }

  async function writeAsset(relativePath: string, bytes = 5) {
    const filePath = join(tempDir!, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.alloc(bytes, 1));
  }

  async function writeText(relativePath: string, value = "") {
    const filePath = join(tempDir!, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, value, "utf8");
  }

  it("requires gallery-reviewed suites to have gallery entries and assets", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "demo-machine-gates-"));
    await writeJson("examples/manifest.json", {
      version: 1,
      suites: [
        {
          slug: "todo-app",
          canonicalSpec: "examples/showcase/todo-app.demo.yaml",
          visualBaseline: "gallery",
          qualitySignals: ["gallery-reviewed"],
        },
      ],
    });
    await writeJson("assets/demo-gallery/manifest.json", {
      results: [
        {
          slug: "todo-app",
          spec: "examples/showcase/todo-app.demo.yaml",
          gif: "assets/demo-gallery/todo-app.gif",
          frames: [
            "assets/demo-gallery/todo-app-01.webp",
            "assets/demo-gallery/todo-app-02.webp",
            "assets/demo-gallery/todo-app-03.webp",
            "assets/demo-gallery/todo-app-04.webp",
            "assets/demo-gallery/todo-app-05.webp",
          ],
        },
      ],
    });
    await writeAsset("assets/demo-gallery/todo-app.gif");
    for (let i = 1; i <= 5; i++) {
      await writeAsset(`assets/demo-gallery/todo-app-0${String(i)}.webp`);
    }

    const results = await checkGalleryConsistency({ root: tempDir });

    expect(results.some((result) => result.status === "fail")).toBe(false);
    expect(results.at(-1)?.message).toContain("checked 1 reviewed suites");
  });

  it("fails missing gallery assets and can make stale spec paths strict", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "demo-machine-gates-"));
    await writeJson("examples/manifest.json", {
      version: 1,
      suites: [
        {
          slug: "todo-app",
          canonicalSpec: "examples/showcase/todo-app.demo.yaml",
          visualBaseline: "gallery",
          qualitySignals: ["gallery-reviewed"],
        },
      ],
    });
    await writeJson("assets/demo-gallery/manifest.json", {
      results: [
        {
          slug: "todo-app",
          spec: "examples/todo-app.demo.yaml",
          gif: "assets/demo-gallery/todo-app.gif",
          frames: ["assets/demo-gallery/todo-app-01.webp"],
        },
      ],
    });

    const defaultResults = await checkGalleryConsistency({ root: tempDir });
    const strictResults = await checkGalleryConsistency({ root: tempDir, strictSpecPaths: true });

    expect(defaultResults.some((result) => result.status === "warn")).toBe(true);
    expect(defaultResults.some((result) => result.message.includes("missing"))).toBe(true);
    expect(
      strictResults.some(
        (result) => result.status === "fail" && result.message.includes("expected"),
      ),
    ).toBe(true);
  });

  it("requires the README main showcase video, poster, manifest suite, and broad gallery", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "demo-machine-gates-"));
    await writeFile(
      join(tempDir, "README.md"),
      [
        "examples/assurance/long-demo/long-demo.demo.yaml",
        "assets/demo-gallery/assurance-long-demo-poster.webp",
        "assets/demo-gallery/assurance-long-demo.mp4",
      ].join("\n"),
      "utf8",
    );
    await writeJson("examples/manifest.json", {
      version: 1,
      suites: [
        {
          slug: "assurance-long-demo",
          canonicalSpec: "examples/assurance/long-demo/long-demo.demo.yaml",
          qualitySignals: ["narration-sync", "cursor-overlays", "selector-intent"],
        },
      ],
    });
    await writeJson("assets/demo-gallery/manifest.json", {
      results: Array.from({ length: 10 }, (_, index) => ({
        slug: `demo-${String(index)}`,
        gif: `assets/demo-gallery/demo-${String(index)}.gif`,
        frames: Array.from(
          { length: 5 },
          (_unused, frameIndex) =>
            `assets/demo-gallery/demo-${String(index)}-${String(frameIndex)}.webp`,
        ),
        durationSec: 12,
      })),
    });
    await writeAsset("assets/demo-gallery/assurance-long-demo.mp4", 1_000_000);
    await writeAsset("assets/demo-gallery/assurance-long-demo-poster.webp", 10_000);

    const results = await checkShowcaseAssets({ root: tempDir });

    expect(results.some((result) => result.status === "fail")).toBe(false);
    expect(results.some((result) => result.message.includes("10 high-quality entries"))).toBe(true);
  });

  it("fails when the main showcase is not protected by README assets", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "demo-machine-gates-"));
    await writeFile(join(tempDir, "README.md"), "missing showcase", "utf8");
    await writeJson("examples/manifest.json", {
      version: 1,
      suites: [
        {
          slug: "assurance-long-demo",
          canonicalSpec: "examples/assurance/long-demo/long-demo.demo.yaml",
          qualitySignals: [],
        },
      ],
    });
    await writeJson("assets/demo-gallery/manifest.json", {
      results: [],
    });

    const results = await checkShowcaseAssets({ root: tempDir });

    expect(results.some((result) => result.status === "fail")).toBe(true);
    expect(results.some((result) => result.message.includes("README is missing"))).toBe(true);
    expect(results.some((result) => result.message.includes("too small"))).toBe(false);
  });

  it("smokes the packed package from a clean install directory", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "demo-machine-gates-"));
    await writeJson("package.json", {
      name: "demo-machine",
      main: "dist/index.js",
      types: "dist/index.d.ts",
      bin: {
        "demo-machine": "dist/cli.js",
      },
    });
    await writeText("dist/index.js");
    await writeText("dist/index.d.ts");
    await writeText("dist/cli.js");

    const commands: Array<{ command: string; args: string[]; cwd: string }> = [];
    const run = (command: string, args: string[], cwd: string) => {
      commands.push({ command, args, cwd });

      if (command === "pnpm" && args[0] === "pack" && args.includes("--pack-destination")) {
        const destination = args[args.indexOf("--pack-destination") + 1]!;
        mkdirSync(destination, { recursive: true });
        const tarball = join(destination, "demo-machine-0.3.0.tgz");
        writeFileSync(tarball, "packed");
        return { status: 0, stdout: `${tarball}\n`, stderr: "" };
      }

      if (command === "npm" && args[0] === "install") {
        const packageDir = join(cwd, "node_modules", "demo-machine");
        mkdirSync(join(packageDir, "dist"), { recursive: true });
        mkdirSync(join(packageDir, "remotion", "src"), { recursive: true });
        writeFileSync(join(packageDir, "dist", "cli.js"), "");
        writeFileSync(join(packageDir, "remotion", "src", "Root.tsx"), "");
      }

      return { status: 0, stdout: "", stderr: "" };
    };

    const results = await checkPackageReadiness({
      root: tempDir,
      dryRun: true,
      installSmoke: true,
      run,
    });

    expect(results.some((result) => result.status === "fail")).toBe(false);
    expect(
      commands.some((item) => item.command === "pnpm" && item.args.includes("--dry-run")),
    ).toBe(true);
    expect(
      commands.some(
        (item) =>
          item.command === "npm" &&
          item.args[0] === "install" &&
          item.args.includes("--omit=optional"),
      ),
    ).toBe(true);
    expect(
      commands.some(
        (item) =>
          item.command === "node" && item.args.includes("examples") && item.args.includes("list"),
      ),
    ).toBe(true);
  });
});
