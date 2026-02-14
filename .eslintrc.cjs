/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: "./tsconfig.json",
  },
  plugins: [
    "@typescript-eslint",
    "sonarjs",
    "import",
    "unused-imports",
  ],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:sonarjs/recommended",
    "plugin:import/typescript",
  ],
  rules: {
    complexity: ["error", 10],
    "max-depth": ["error", 4],
    "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }],
    "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
    "max-params": ["error", 4],
    "sonarjs/cognitive-complexity": ["error", 15],
    "import/no-cycle": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": "off",
    "unused-imports/no-unused-imports": "error",
    "unused-imports/no-unused-vars": [
      "error",
      { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" },
    ],
    "no-console": ["warn", { allow: ["warn", "error"] }],
  },
  ignorePatterns: ["dist", "node_modules", "*.cjs", "*.mjs"],
};
