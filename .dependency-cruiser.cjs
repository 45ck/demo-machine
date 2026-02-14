/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "No circular dependencies allowed",
      from: {},
      to: { circular: true },
    },
    {
      name: "spec-is-leaf",
      severity: "error",
      comment: "src/spec/ must not import from other src modules",
      from: { path: "^src/spec/" },
      to: { path: "^src/(?!spec/|utils/)" },
    },
    {
      name: "runner-deps",
      severity: "error",
      comment: "src/runner/ can only import from spec and utils",
      from: { path: "^src/runner/" },
      to: { path: "^src/(?!spec/|runner/|utils/)" },
    },
    {
      name: "playback-deps",
      severity: "error",
      comment: "src/playback/ can only import from spec, redaction, and utils",
      from: { path: "^src/playback/" },
      to: { path: "^src/(?!spec/|playback/|redaction/|utils/)" },
    },
    {
      name: "capture-deps",
      severity: "error",
      comment: "src/capture/ can only import from spec, playback, and utils",
      from: { path: "^src/capture/" },
      to: { path: "^src/(?!spec/|capture/|playback/|utils/)" },
    },
    {
      name: "editor-deps",
      severity: "error",
      comment: "src/editor/ can only import from spec, capture, and utils",
      from: { path: "^src/editor/" },
      to: { path: "^src/(?!spec/|editor/|capture/|utils/)" },
    },
    {
      name: "narration-deps",
      severity: "error",
      comment: "src/narration/ can only import from spec, capture, and utils",
      from: { path: "^src/narration/" },
      to: { path: "^src/(?!spec/|narration/|capture/|utils/)" },
    },
    {
      name: "redaction-deps",
      severity: "error",
      comment: "src/redaction/ can only import from spec and utils",
      from: { path: "^src/redaction/" },
      to: { path: "^src/(?!spec/|redaction/|utils/)" },
    },
    {
      name: "no-test-in-src",
      severity: "error",
      comment: "No test code imported from src",
      from: { path: "^src/" },
      to: { path: "tests/" },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};
