import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("package files", () => {
  it("ships Remotion source used by the runtime Remotion renderer", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8")) as { files?: string[] };

    expect(pkg.files).toContain("remotion/");
  });

  it("ships README-linked docs without bundling heavyweight gallery media", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8")) as { files?: string[] };

    expect(pkg.files).toContain("docs/");
    expect(pkg.files).toContain("GETTING-STARTED.md");
    expect(pkg.files).toContain("ROADMAP.md");
    expect(pkg.files).not.toContain("assets/demo-gallery/");
  });

  it("declares Remotion runtime packages as optional peers", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8")) as {
      peerDependencies?: Record<string, string>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };

    for (const dep of [
      "@remotion/bundler",
      "@remotion/media-utils",
      "@remotion/renderer",
      "react",
      "remotion",
    ]) {
      expect(pkg.peerDependencies).toHaveProperty(dep);
      expect(pkg.peerDependenciesMeta?.[dep]?.optional).toBe(true);
    }
  });
});
