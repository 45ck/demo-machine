import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildExampleSuiteSpecs, filterExampleSuiteSpecs } from "../../scripts/examples-suite.mjs";

const root = path.resolve("C:/repo/demo-machine");

const manifest = {
  suites: [
    {
      slug: "todo-app",
      canonicalSpec: "examples/showcase/todo-app.demo.yaml",
      variantSpecs: [],
      releaseTier: "pr",
      suiteType: "showcase",
      visualBaseline: "gallery",
    },
    {
      slug: "form-wizard",
      canonicalSpec: "examples/showcase/form-wizard.demo.yaml",
      variantSpecs: [
        "examples/proof/variants/form-wizard-autosync.demo.yaml",
        "examples/proof/variants/form-wizard-redaction.demo.yaml",
      ],
      releaseTier: "nightly",
      suiteType: "showcase",
      visualBaseline: "gallery",
    },
    {
      slug: "proof-click",
      canonicalSpec: "examples/proof/actions/proof-click.demo.yaml",
      variantSpecs: [],
      releaseTier: "proof",
      suiteType: "proof",
      visualBaseline: "none",
    },
  ],
};

describe("examples-suite output names", () => {
  it("uses manifest slugs for canonical specs", () => {
    const specs = buildExampleSuiteSpecs(manifest, root);

    expect(specs).toContainEqual(
      expect.objectContaining({
        spec: path.resolve(root, "examples/showcase/todo-app.demo.yaml"),
        outputName: "todo-app",
        kind: "canonical",
        releaseTier: "pr",
        suiteType: "showcase",
      }),
    );
    expect(specs).toContainEqual(
      expect.objectContaining({
        spec: path.resolve(root, "examples/proof/actions/proof-click.demo.yaml"),
        outputName: "proof-click",
        kind: "canonical",
      }),
    );
    expect(specs.map((spec) => spec.outputName)).not.toContain("showcase-todo-app");
  });

  it("uses stable slug-like names for variants", () => {
    const specs = buildExampleSuiteSpecs(manifest, root);

    expect(specs).toContainEqual(
      expect.objectContaining({
        spec: path.resolve(root, "examples/proof/variants/form-wizard-autosync.demo.yaml"),
        outputName: "form-wizard-autosync",
        kind: "variant",
      }),
    );
    expect(specs).toContainEqual(
      expect.objectContaining({
        spec: path.resolve(root, "examples/proof/variants/form-wizard-redaction.demo.yaml"),
        outputName: "form-wizard-redaction",
        kind: "variant",
      }),
    );
    expect(specs.map((spec) => spec.outputName)).not.toContain(
      "proof-variants-form-wizard-autosync",
    );
  });

  it("preserves substring filtering over spec paths and output names", () => {
    const specs = buildExampleSuiteSpecs(manifest, root);

    expect(
      filterExampleSuiteSpecs(specs, "examples/showcase").map((spec) => spec.outputName),
    ).toEqual(["form-wizard", "todo-app"]);
    expect(filterExampleSuiteSpecs(specs, "redaction").map((spec) => spec.outputName)).toEqual([
      "form-wizard-redaction",
    ]);
    expect(filterExampleSuiteSpecs(specs, "proof-click").map((spec) => spec.outputName)).toEqual([
      "proof-click",
    ]);
  });

  it("filters by release tier, suite type, and canonical-only status", () => {
    const specs = buildExampleSuiteSpecs(manifest, root);

    expect(
      filterExampleSuiteSpecs(specs, {
        releaseTier: "pr",
        suiteType: "showcase",
        canonicalOnly: true,
      }).map((spec) => spec.outputName),
    ).toEqual(["todo-app"]);
    expect(
      filterExampleSuiteSpecs(specs, {
        releaseTier: "nightly",
        suiteType: "showcase",
      }).map((spec) => spec.outputName),
    ).toEqual(["form-wizard-autosync", "form-wizard-redaction", "form-wizard"]);
    expect(
      filterExampleSuiteSpecs(specs, {
        suiteType: "proof",
      }).map((spec) => spec.outputName),
    ).toEqual(["proof-click"]);
  });
});
