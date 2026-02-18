import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // CLI modules are thin orchestration wrappers; we keep the coverage gate focused on core logic.
      exclude: ["src/**/*.test.ts", "src/cli.ts", "src/cli/**/*.ts"],
      thresholds: {
        branches: 70,
        statements: 55,
      },
    },
  },
});
