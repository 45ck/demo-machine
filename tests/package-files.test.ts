import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("package files", () => {
  it("ships Remotion source used by the runtime Remotion renderer", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8")) as { files?: string[] };

    expect(pkg.files).toContain("remotion/");
  });

  it("declares Remotion runtime packages as optional peers", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8")) as {
      peerDependencies?: Record<string, string>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };

    for (const dep of ["@remotion/bundler", "@remotion/renderer", "react", "remotion"]) {
      expect(pkg.peerDependencies).toHaveProperty(dep);
      expect(pkg.peerDependenciesMeta?.[dep]?.optional).toBe(true);
    }
  });
});
