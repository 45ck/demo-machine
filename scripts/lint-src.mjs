import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { ESLint } from "eslint";

async function collectTypeScriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

const files = await collectTypeScriptFiles("src");
const eslint = new ESLint({ cache: true });
const results = await eslint.lintFiles(files);
const formatter = await eslint.loadFormatter("stylish");
const output = formatter.format(results);

if (output) {
  console.log(output);
}

const errorCount = results.reduce((total, result) => total + result.errorCount, 0);
const warningCount = results.reduce((total, result) => total + result.warningCount, 0);

if (errorCount > 0 || warningCount > 0) {
  process.exitCode = 1;
}
