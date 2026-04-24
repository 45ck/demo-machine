import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

interface PackageJson {
  version?: unknown;
}

export function getPackageVersion(): string {
  const pkg = require("../package.json") as PackageJson;
  return typeof pkg.version === "string" && pkg.version.length > 0 ? pkg.version : "0.0.0";
}
