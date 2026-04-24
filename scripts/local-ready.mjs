#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

const STEPS = [
  ["pnpm", ["build"]],
  ["pnpm", ["validate"]],
  ["node", ["scripts/examples-suite.mjs", "--mode", "validate", "--no-build"]],
];

function runStep(command, args) {
  return new Promise((resolve, reject) => {
    const label = [command, ...args].join(" ");
    console.log(`\n> ${label}`);
    const child =
      process.platform === "win32"
        ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", label], {
            stdio: "inherit",
          })
        : spawn(command, args, {
            stdio: "inherit",
          });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} failed with exit code ${code ?? "unknown"}`));
      }
    });
  });
}

for (const [command, args] of STEPS) {
  await runStep(command, args);
}

console.log("\nLocal readiness checks passed.");
