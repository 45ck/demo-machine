#!/usr/bin/env node
/**
 * meta-prompt-qa.mjs
 *
 * Builds a fresh project workspace that asks Codex CLI to use a local
 * demo-machine skill and produce reviewable demos for a small software app.
 *
 * The default command only scaffolds the workspace and prompt. Pass
 * --run-codex to execute the nondeterministic agent lane.
 */
import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

class UsageError extends Error {}

const DEFAULT_PORT = 4187;
const REQUIRED_DEMO_ACTIONS = [
  "navigate",
  "click",
  "type",
  "hover",
  "scroll",
  "press",
  "back",
  "forward",
  "assert",
  "screenshot",
  "wait",
  "check",
  "uncheck",
  "select",
  "upload",
  "dragAndDrop",
];
const VALUE_OPTIONS = new Set(["--workspace-dir", "--output-dir", "--model", "--codex-cmd"]);
const FLAG_OPTIONS = new Set([
  "--run-codex",
  "--clean",
  "--skip-build",
  "--review-only",
  "-h",
  "--help",
]);

function parseArgs(argv) {
  const opts = {
    workspaceDir: "output/meta-prompt-qa/workspace",
    outputDir: "output/meta-prompt-qa",
    runCodex: false,
    clean: false,
    build: true,
    reviewOnly: false,
    model: null,
    codexCmd: "codex",
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const rawArg = argv[i];
    const equalsIndex = rawArg.indexOf("=");
    const arg = equalsIndex === -1 ? rawArg : rawArg.slice(0, equalsIndex);
    let value = equalsIndex === -1 ? null : rawArg.slice(equalsIndex + 1);

    if (FLAG_OPTIONS.has(arg)) {
      if (value != null) throw new UsageError(`${arg} does not accept a value`);
      if (arg === "--run-codex") opts.runCodex = true;
      if (arg === "--clean") opts.clean = true;
      if (arg === "--skip-build") opts.build = false;
      if (arg === "--review-only") opts.reviewOnly = true;
      if (arg === "-h" || arg === "--help") opts.help = true;
      continue;
    }

    if (!VALUE_OPTIONS.has(arg)) throw new UsageError(`Unknown option: ${rawArg}`);

    if (value == null) value = argv[++i] ?? null;
    if (value == null || value.startsWith("--")) throw new UsageError(`Missing value for ${arg}`);

    if (arg === "--workspace-dir") opts.workspaceDir = value;
    if (arg === "--output-dir") opts.outputDir = value;
    if (arg === "--model") opts.model = value;
    if (arg === "--codex-cmd") opts.codexCmd = value;
  }

  return opts;
}

function usage() {
  console.log(
    [
      "meta-prompt-qa",
      "",
      "Usage:",
      "  node scripts/meta-prompt-qa.mjs [options]",
      "",
      "Default behavior scaffolds a fresh QA workspace and writes the Codex prompt.",
      "Pass --run-codex to execute Codex CLI inside that workspace.",
      "",
      "Options:",
      "  --run-codex               Run `codex exec` after scaffolding",
      "  --review-only             Rebuild review.html from existing outputs",
      "  --clean                   Remove the workspace/output directory first",
      "  --skip-build              Do not run `pnpm build` before Codex",
      "  --workspace-dir <dir>     Fresh project directory (default: output/meta-prompt-qa/workspace)",
      "  --output-dir <dir>        QA artifact directory (default: output/meta-prompt-qa)",
      "  --model <model>           Optional Codex model override",
      "  --codex-cmd <command>     Codex executable (default: codex)",
      "  -h, --help                Show this help",
      "",
      "Typical full run:",
      "  node scripts/meta-prompt-qa.mjs --clean --run-codex",
    ].join("\n"),
  );
}

function resolveCommand(command) {
  if (process.platform !== "win32") return command;
  if (command === "pnpm") return "pnpm.cmd";
  if (command === "node") return "node.exe";
  if (command === "codex") return "codex.cmd";
  return command;
}

function needsShell(command) {
  return process.platform === "win32" && (command === "pnpm" || command === "codex");
}

function runStep(label, command, args, { cwd, input } = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n> ${label}`);
    const child = spawn(resolveCommand(command), args, {
      cwd,
      stdio: input == null ? "inherit" : ["pipe", "inherit", "inherit"],
      shell: needsShell(command),
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit code ${code ?? "unknown"}`));
    });

    if (input != null) {
      child.stdin.end(input);
    }
  });
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function posixPath(value) {
  return value.replaceAll("\\", "/");
}

function jsonString(value) {
  return JSON.stringify(value);
}

function packageJson() {
  return `${JSON.stringify(
    {
      name: "demo-machine-meta-prompt-fixture",
      version: "0.0.0",
      private: true,
      type: "module",
      scripts: {
        start: "node serve.mjs",
        dev: "node serve.mjs",
      },
    },
    null,
    2,
  )}\n`;
}

function serveScript() {
  return `import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || ${DEFAULT_PORT});
const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\\/+/, "");
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

const server = http.createServer(async (req, res) => {
  const filePath = safePath(req.url || "/");
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    res.writeHead(200, {
      "content-type": types.get(path.extname(filePath)) || "application/octet-stream",
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(port, () => {
  console.log(\`Meta prompt fixture app listening at http://localhost:\${port}\`);
});
`;
}

function appHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Launch Desk</title>
    <style>
      :root {
        color-scheme: light;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #eef2f7;
        color: #172033;
      }

      body {
        margin: 0;
      }

      .shell {
        min-height: 100vh;
        display: grid;
        grid-template-columns: 248px 1fr;
      }

      aside {
        background: #172033;
        color: #f8fafc;
        padding: 28px 22px;
      }

      .brand {
        font-size: 22px;
        font-weight: 760;
        margin-bottom: 28px;
      }

      nav {
        display: grid;
        gap: 8px;
      }

      nav button,
      .primary,
      .ghost {
        border: 0;
        border-radius: 7px;
        font: inherit;
        cursor: pointer;
      }

      nav button {
        padding: 10px 12px;
        text-align: left;
        color: #cbd5e1;
        background: transparent;
      }

      nav button[aria-current="page"] {
        background: #26344d;
        color: #ffffff;
      }

      main {
        padding: 26px 30px 34px;
      }

      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 22px;
      }

      h1 {
        font-size: 28px;
        margin: 0 0 6px;
      }

      .subtle {
        color: #5c667a;
      }

      .primary {
        background: #0f766e;
        color: #fff;
        padding: 10px 14px;
        font-weight: 700;
      }

      .ghost {
        background: #e6edf4;
        color: #172033;
        padding: 8px 12px;
      }

      .metrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(150px, 1fr));
        gap: 14px;
        margin-bottom: 18px;
      }

      .metric,
      .panel,
      .task {
        background: #ffffff;
        border: 1px solid #d9e2ec;
        border-radius: 8px;
        box-shadow: 0 1px 2px rgb(15 23 42 / 7%);
      }

      .metric {
        padding: 16px;
      }

      .metric strong {
        display: block;
        font-size: 26px;
        margin-top: 4px;
      }

      .grid {
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 18px;
      }

      .panel {
        padding: 16px;
      }

      .panel h2 {
        font-size: 17px;
        margin: 0 0 12px;
      }

      .board {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }

      .lane {
        background: #f7f9fc;
        border: 1px solid #d9e2ec;
        border-radius: 8px;
        padding: 12px;
        min-height: 342px;
      }

      .lane h3 {
        font-size: 14px;
        margin: 0 0 10px;
        color: #40506a;
      }

      .task {
        padding: 12px;
        margin-bottom: 10px;
      }

      .task strong {
        display: block;
        margin-bottom: 5px;
      }

      .tag {
        display: inline-block;
        border-radius: 999px;
        padding: 3px 8px;
        background: #e0f2fe;
        color: #075985;
        font-size: 12px;
        margin-top: 8px;
      }

      label {
        display: grid;
        gap: 6px;
        margin-bottom: 12px;
        font-weight: 650;
      }

      input,
      select,
      textarea {
        border: 1px solid #c8d3df;
        border-radius: 7px;
        padding: 9px 10px;
        font: inherit;
        background: #fff;
      }

      textarea {
        min-height: 92px;
        resize: vertical;
      }

      .workbench {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }

      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }

      .modal {
        position: fixed;
        inset: 0;
        display: grid;
        place-items: center;
        background: rgb(15 23 42 / 45%);
        z-index: 10;
      }

      .modal-body {
        width: min(520px, calc(100vw - 36px));
        background: #ffffff;
        border-radius: 8px;
        padding: 18px;
        box-shadow: 0 24px 70px rgb(15 23 42 / 32%);
      }

      .tooltip {
        position: relative;
      }

      .tooltip [role="tooltip"] {
        position: absolute;
        left: 0;
        top: calc(100% + 8px);
        width: 230px;
        background: #172033;
        color: #fff;
        border-radius: 6px;
        padding: 8px 10px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s;
      }

      .tooltip:hover [role="tooltip"],
      .tooltip:focus-within [role="tooltip"] {
        opacity: 1;
      }

      .audit-log {
        height: 180px;
        overflow: auto;
        border: 1px solid #d9e2ec;
        border-radius: 7px;
        padding: 8px;
        background: #f8fafc;
      }

      .audit-log p {
        margin: 0;
        padding: 8px 4px;
        border-bottom: 1px solid #e4eaf0;
      }

      .drop-zone {
        min-height: 86px;
        display: grid;
        place-items: center;
        border: 2px dashed #8aa1b8;
        border-radius: 8px;
        background: #f8fafc;
        color: #40506a;
        text-align: center;
      }

      .drop-zone.active {
        border-color: #0f766e;
        background: #ecfdf5;
        color: #0f5132;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 10px 8px;
        border-bottom: 1px solid #e4eaf0;
        text-align: left;
      }

      th {
        color: #40506a;
        font-size: 13px;
      }

      .toast {
        position: fixed;
        right: 24px;
        bottom: 24px;
        background: #172033;
        color: #fff;
        padding: 12px 14px;
        border-radius: 8px;
        box-shadow: 0 12px 30px rgb(15 23 42 / 25%);
      }

      [hidden] {
        display: none !important;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside>
        <div class="brand">Launch Desk</div>
        <nav aria-label="Primary">
          <button type="button" aria-current="page" data-testid="nav-launches">Launches</button>
          <button type="button" data-testid="nav-customers">Customers</button>
          <button type="button" data-testid="nav-reports">Reports</button>
        </nav>
      </aside>
      <main>
        <header>
          <div>
            <h1>Launch operations</h1>
            <div class="subtle">Coordinate product launch tasks, owners, and customer readiness.</div>
          </div>
          <button class="primary" type="button" data-testid="new-task">New task</button>
        </header>

        <section class="metrics" aria-label="Launch metrics">
          <div class="metric"><span class="subtle">Readiness</span><strong data-testid="readiness">86%</strong></div>
          <div class="metric"><span class="subtle">Open tasks</span><strong data-testid="open-count">9</strong></div>
          <div class="metric"><span class="subtle">Customers briefed</span><strong>42</strong></div>
          <div class="metric"><span class="subtle">Risk items</span><strong data-testid="risk-count">3</strong></div>
        </section>

        <section class="grid">
          <div class="panel">
            <h2>Launch board</h2>
            <div class="board" data-testid="launch-board">
              <div class="lane">
                <h3>Plan</h3>
                <article class="task">
                  <strong>Approve pricing FAQ</strong>
                  <span class="subtle">Owner: Priya</span>
                  <span class="tag">Legal</span>
                </article>
                <article class="task">
                  <strong>Segment beta feedback</strong>
                  <span class="subtle">Owner: Omar</span>
                  <span class="tag">Research</span>
                </article>
              </div>
              <div class="lane">
                <h3>Build</h3>
                <article class="task">
                  <strong>Record enablement clip</strong>
                  <span class="subtle">Owner: Mei</span>
                  <span class="tag">Sales</span>
                </article>
                <article class="task">
                  <strong>Finalize migration checklist</strong>
                  <span class="subtle">Owner: Jules</span>
                  <span class="tag">Success</span>
                </article>
              </div>
              <div class="lane">
                <h3>Ready</h3>
                <article class="task">
                  <strong>Publish launch room</strong>
                  <span class="subtle">Owner: Nina</span>
                  <span class="tag">Ops</span>
                </article>
              </div>
            </div>
          </div>

          <div class="panel">
            <h2>Create task</h2>
            <form data-testid="task-form">
              <label>
                Task name
                <input name="task" data-testid="task-name" placeholder="Add launch task" />
              </label>
              <label>
                Owner
                <select name="owner" data-testid="task-owner">
                  <option>Priya</option>
                  <option>Omar</option>
                  <option>Mei</option>
                  <option>Jules</option>
                </select>
              </label>
              <label>
                Notes
                <textarea name="notes" data-testid="task-notes" placeholder="What should the launch team know?"></textarea>
              </label>
              <button class="primary" type="submit" data-testid="save-task">Save task</button>
              <button class="ghost" type="button" data-testid="clear-task">Clear</button>
            </form>
          </div>
        </section>

        <section class="panel" style="margin-top: 18px">
          <h2>Customer readiness</h2>
          <table>
            <thead>
              <tr><th>Customer</th><th>Plan</th><th>Status</th><th>Next step</th></tr>
            </thead>
            <tbody>
              <tr><td>Acme Cloud</td><td>Enterprise</td><td>Briefed</td><td>Send migration checklist</td></tr>
              <tr><td>Northstar Bank</td><td>Business</td><td>At risk</td><td>Schedule security review</td></tr>
              <tr><td>Bright Labs</td><td>Startup</td><td>Ready</td><td>Invite champions</td></tr>
            </tbody>
          </table>
        </section>

        <section class="panel" style="margin-top: 18px" data-testid="ux-workbench">
          <h2>UX workbench</h2>
          <div class="workbench">
            <div>
              <div class="toolbar">
                <button class="primary" type="button" data-testid="open-briefing-modal">Brief launch</button>
                <span class="tooltip">
                  <button class="ghost" type="button" data-testid="risk-help">Risk help</button>
                  <span role="tooltip" data-testid="risk-tooltip">Risk drops when a launch owner confirms coverage.</span>
                </span>
              </div>
              <label style="margin-top: 12px">
                Customer search
                <input data-testid="customer-search" placeholder="Search customers" />
              </label>
              <div class="subtle" data-testid="search-result">Showing all customers</div>
              <label style="margin-top: 12px">
                <input type="checkbox" data-testid="approval-checkbox" />
                Require approval before publishing
              </label>
              <div class="subtle" data-testid="approval-status">Approval optional</div>
            </div>

            <div>
              <label>
                Briefing file
                <input type="file" data-testid="briefing-upload" />
              </label>
              <div class="subtle" data-testid="upload-status">No briefing uploaded</div>
              <div
                class="task"
                draggable="true"
                data-testid="drag-risk-card"
                style="margin-top: 12px"
              >
                <strong>Security review risk</strong>
                <span class="subtle">Drag to approval queue</span>
              </div>
              <div class="drop-zone" data-testid="approval-drop-zone">Approval queue is empty</div>
            </div>

            <div>
              <div class="audit-log" data-testid="audit-log" tabindex="0">
                <p>08:30 Pricing FAQ approved</p>
                <p>09:10 Beta feedback tagged</p>
                <p>09:45 Migration checklist drafted</p>
                <p>10:20 Enablement clip recorded</p>
                <p>11:05 Customer champions invited</p>
                <p>12:00 Security review scheduled</p>
                <p>13:15 Legal summary attached</p>
                <p>14:30 Launch room published</p>
                <p>15:20 Executive drill queued</p>
              </div>
              <div class="subtle" data-testid="route-status" style="margin-top: 10px">
                Route: launches
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>

    <div class="toast" role="status" data-testid="toast" hidden>Task saved to launch board.</div>
    <div class="modal" data-testid="briefing-modal" role="dialog" aria-modal="true" hidden>
      <div class="modal-body">
        <h2>Launch briefing</h2>
        <p>Confirm the launch room, owner coverage, customer readiness, and open risk items.</p>
        <button class="primary" type="button" data-testid="confirm-briefing">Confirm briefing</button>
        <button class="ghost" type="button" data-testid="close-briefing-modal">Close</button>
      </div>
    </div>

    <script>
      const form = document.querySelector('[data-testid="task-form"]');
      const toast = document.querySelector('[data-testid="toast"]');
      const openCount = document.querySelector('[data-testid="open-count"]');
      const riskCount = document.querySelector('[data-testid="risk-count"]');
      const buildLane = document.querySelectorAll(".lane")[1];
      const modal = document.querySelector('[data-testid="briefing-modal"]');
      const routeStatus = document.querySelector('[data-testid="route-status"]');
      const uploadStatus = document.querySelector('[data-testid="upload-status"]');
      const approvalStatus = document.querySelector('[data-testid="approval-status"]');
      const searchResult = document.querySelector('[data-testid="search-result"]');
      const dropZone = document.querySelector('[data-testid="approval-drop-zone"]');
      const riskCard = document.querySelector('[data-testid="drag-risk-card"]');

      function setRoute(route) {
        for (const button of document.querySelectorAll("nav button")) {
          button.setAttribute("aria-current", button.textContent.toLowerCase() === route ? "page" : "false");
        }
        routeStatus.textContent = "Route: " + route;
        history.pushState({ route }, "", "#/" + route);
      }

      for (const button of document.querySelectorAll("nav button")) {
        button.addEventListener("click", () => setRoute(button.textContent.toLowerCase()));
      }

      window.addEventListener("popstate", () => {
        const route = location.hash.replace("#/", "") || "launches";
        routeStatus.textContent = "Route: " + route;
      });

      document.querySelector('[data-testid="new-task"]').addEventListener("click", () => {
        document.querySelector('[data-testid="task-name"]').focus();
      });

      document.querySelector('[data-testid="clear-task"]').addEventListener("click", () => {
        form.reset();
        document.querySelector('[data-testid="task-name"]').focus();
      });

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const task = String(data.get("task") || "Untitled task").trim();
        const owner = String(data.get("owner") || "Priya");
        const article = document.createElement("article");
        article.className = "task";
        article.innerHTML =
          "<strong></strong><span class='subtle'></span><span class='tag'>New</span>";
        article.querySelector("strong").textContent = task;
        article.querySelector(".subtle").textContent = "Owner: " + owner;
        buildLane.append(article);
        openCount.textContent = String(Number(openCount.textContent) + 1);
        riskCount.textContent = "2";
        toast.hidden = false;
        setTimeout(() => {
          toast.hidden = true;
        }, 2500);
        form.reset();
      });

      document.querySelector('[data-testid="open-briefing-modal"]').addEventListener("click", () => {
        modal.hidden = false;
      });

      document.querySelector('[data-testid="close-briefing-modal"]').addEventListener("click", () => {
        modal.hidden = true;
      });

      document.querySelector('[data-testid="confirm-briefing"]').addEventListener("click", () => {
        modal.hidden = true;
        toast.textContent = "Briefing confirmed.";
        toast.hidden = false;
      });

      document.querySelector('[data-testid="approval-checkbox"]').addEventListener("change", (event) => {
        approvalStatus.textContent = event.target.checked ? "Approval required" : "Approval optional";
      });

      document.querySelector('[data-testid="customer-search"]').addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        searchResult.textContent = "Filtered to Northstar Bank";
      });

      document.querySelector('[data-testid="briefing-upload"]').addEventListener("change", (event) => {
        const file = event.target.files[0];
        uploadStatus.textContent = file ? "Uploaded " + file.name : "No briefing uploaded";
      });

      riskCard.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", "Security review risk");
      });

      dropZone.addEventListener("dragover", (event) => {
        event.preventDefault();
        dropZone.classList.add("active");
      });

      dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("active");
      });

      dropZone.addEventListener("drop", (event) => {
        event.preventDefault();
        dropZone.classList.remove("active");
        dropZone.textContent = event.dataTransfer.getData("text/plain") + " queued for approval";
      });
    </script>
  </body>
</html>
`;
}

function skillMarkdown({ root, workspaceDir }) {
  const cli = path.join(root, "dist", "cli.js");
  const videoAssurance = path.join(root, "scripts", "video-assurance.mjs");
  const actionList = REQUIRED_DEMO_ACTIONS.map((action) => `\`${action}\``).join(", ");
  return `---
name: demo-machine
description: Use when creating, validating, running, or reviewing Demo Machine demos from specs.
---

# Demo Machine Skill

Use this skill when creating, validating, running, or reviewing Demo Machine demos.

## Local Commands

- Demo Machine CLI: \`node ${jsonString(cli)}\`
- Video assurance: \`node ${jsonString(videoAssurance)}\`
- Fixture app: \`node serve.mjs\` from \`${workspaceDir}\`
- Fixture URL: \`http://localhost:${DEFAULT_PORT}\`

## Workflow

1. Inspect \`index.html\` and the running app before writing specs.
2. Create high-quality specs under \`demos/\`. Prefer \`target\` locators with \`testId\`, role, label, or text. Avoid brittle CSS unless there is no stable alternative.
3. Tell a coherent product story. Include chapters, narration text, screenshots, assertions, and interactions that prove the app changed state.
4. Run \`node ${jsonString(cli)} validate <spec>\` until validation passes.
5. Run \`node ${jsonString(cli)} run <spec> --output demo-machine-output/<slug> --overwrite --tts-provider kokoro\` for each demo. Do not use \`--no-narration\`; audible narration is part of this QA lane.
6. Inspect \`quality.json\`, \`events.json\`, screenshots, \`subtitles.vtt\`, audio artifacts, and \`output.mp4\`. Fix the spec and rerun if there are failures, missing audio, or poor visual evidence.
7. Run \`node ${jsonString(videoAssurance)} --output-dir demo-machine-output\` after MP4s exist.
8. Verify the final MP4 has an audio stream with \`ffprobe\` or Demo Machine quality evidence.
9. Write \`SELF_EVALUATION.md\` with commands run, pass/fail status, artifact paths, audio/narration status, action/component coverage, remaining risks, and exactly what a human should review.

## Narration Focus And Clicks

- Use narration focus to guide attention: explicit \`focus.selector\` or \`focus.target\`, highlight, cursor, and a gentle zoom are preferred when narration names a specific element.
- Treat zoom/highlight as presentation only. Show any visual click pulse while zoomed, then clear the transform before the real action runs so Playwright clicks the untransformed DOM coordinates.
- Avoid double-click-looking first interactions: do not stack a focus highlight pulse and a click pulse with identical timing; keep the click pulse visually distinct and confirm the event log contains one real click for one intended click.
- For long narrated demos, watch the MP4 as a user would. If the camera moves to a generic area, misses the narrated element, exits too quickly, overlaps text, or makes the click feel wrong, tighten the selector/focus target and rerun.

## Acceptance Bar

- At least three narrated demos exist and pass validation.
- Each demo produces \`output.mp4\` with audio, \`quality.json\`, \`events.json\`, \`metadata.json\`, \`verification.json\`, \`subtitles.vtt\`, and screenshot or trace evidence.
- The demos collectively cover these Demo Machine actions: ${actionList}.
- The demos cover dashboard navigation, forms, modal dialog, tooltip hover, search with keyboard press, checkbox, select, upload, drag/drop, scrolling, browser back/forward, assertions, screenshots, and a state-changing workflow.
- The final response asks the user to review the generated videos and \`SELF_EVALUATION.md\`.
`;
}

function metaPrompt({ root, workspaceDir, outputDir }) {
  return `You are running Demo Machine meta QA from a fresh project workspace.

Use the local skill first: read .codex/skills/demo-machine/SKILL.md and follow it.

Goal:
Prove that Demo Machine can be discovered and used end to end by an agent in a new project. The fixture app is a complex launch operations product in this folder. Build high-quality narrated demos for it, self-evaluate the outputs, and leave a human-reviewable handoff.

Constraints:
- Work inside this fixture project: ${workspaceDir}
- Do not edit the Demo Machine source checkout: ${root}
- Use the local Demo Machine CLI through the command documented in the skill.
- Keep generated demo specs under demos/.
- Put rendered outputs under demo-machine-output/<demo-slug>/.
- Prefer stable locators from the app, especially data-testid and accessible roles.
- Run the app locally with node serve.mjs when capturing.
- Do not use --no-narration. Render audible narration with --tts-provider kokoro. A silent MP4 is a failed meta QA run.
- Use assets/sample-briefing.txt for upload coverage.
- The generated specs must collectively cover these actions: ${REQUIRED_DEMO_ACTIONS.join(", ")}.

Required work:
1. Inspect the app and decide on at least three demos:
   - a narrated product tour,
   - a narrated state-changing workflow,
   - a narrated component/action coverage demo that exercises the complex UX workbench.
2. Create polished .demo.yaml specs with chapters, screenshots, assertions, narration on meaningful steps, and state-changing interactions.
3. Validate every spec.
4. Run every spec through Demo Machine until it produces reviewable MP4 outputs with audio.
5. Run rendered quality checks and full video assurance.
6. Use ffprobe or artifact evidence to confirm every MP4 has an audio stream.
7. Fix any failures, missing narration/audio, missing action coverage, missing component coverage, or weak demo evidence you find.
8. Write SELF_EVALUATION.md with:
   - specs created
   - commands run
   - artifact paths
   - audio/narration status for each MP4
   - quality status for each demo
   - Demo Machine action coverage
   - UI/component coverage
   - what changed during self-repair
   - remaining risks or manual review notes
9. End by asking the human to review the generated narrated videos and self-evaluation.

After Codex exits, the outer QA harness will collect artifacts into:
${path.join(outputDir, "review.html")}
`;
}

function readmeMarkdown() {
  return `# Demo Machine Meta Prompt Fixture

This is a generated fresh-project QA fixture. It contains a complex software app,
a local Demo Machine skill for Codex, and a prompt that asks Codex CLI to create,
run, self-evaluate, and hand off narrated product demos with broad action coverage.

Run the app:

\`\`\`bash
node serve.mjs
\`\`\`

Run the agent lane from the Demo Machine checkout:

\`\`\`bash
node scripts/meta-prompt-qa.mjs --run-codex
\`\`\`
`;
}

async function writeText(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function rmWithRetries(targetPath, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      const code = error && typeof error === "object" ? error.code : undefined;
      if (code !== "EBUSY" && code !== "ENOTEMPTY" && code !== "EPERM") throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
}

async function scaffoldWorkspace({ root, workspaceDir, outputDir, clean = false }) {
  let activeWorkspaceDir = workspaceDir;
  if (clean) {
    try {
      await rmWithRetries(outputDir);
    } catch (error) {
      activeWorkspaceDir = path.join(outputDir, `workspace-${Date.now()}`);
      console.warn(
        `Could not remove locked output directory; using fresh workspace ${activeWorkspaceDir}`,
      );
    }
  }
  await mkdir(activeWorkspaceDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  await writeText(path.join(activeWorkspaceDir, "package.json"), packageJson());
  await writeText(path.join(activeWorkspaceDir, "serve.mjs"), serveScript());
  await writeText(path.join(activeWorkspaceDir, "index.html"), appHtml());
  await writeText(
    path.join(activeWorkspaceDir, "assets", "sample-briefing.txt"),
    "Launch briefing sample for Demo Machine upload coverage.\n",
  );
  await writeText(path.join(activeWorkspaceDir, "README.md"), readmeMarkdown());
  await writeText(
    path.join(activeWorkspaceDir, ".codex", "skills", "demo-machine", "SKILL.md"),
    skillMarkdown({ root, workspaceDir: activeWorkspaceDir }),
  );
  await writeText(
    path.join(activeWorkspaceDir, "META_PROMPT.md"),
    metaPrompt({ root, workspaceDir: activeWorkspaceDir, outputDir }),
  );
  await writeText(
    path.join(activeWorkspaceDir, "AGENTS.md"),
    [
      "# Agent Notes",
      "",
      "This fixture is intentionally isolated from the Demo Machine source checkout.",
      "Use `.codex/skills/demo-machine/SKILL.md` before creating or reviewing demos.",
      "Generated specs belong in `demos/`; rendered outputs belong in `demo-machine-output/`.",
      "",
    ].join("\n"),
  );

  return {
    workspaceDir: activeWorkspaceDir,
    promptPath: path.join(activeWorkspaceDir, "META_PROMPT.md"),
    reviewPath: path.join(outputDir, "review.html"),
  };
}

async function findFiles(root, predicate, maxDepth = 4) {
  const found = [];

  async function visit(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath, depth + 1);
      } else if (predicate(fullPath, entry.name)) {
        found.push(fullPath);
      }
    }
  }

  await visit(root, 0);
  return found.sort((a, b) => a.localeCompare(b));
}

async function readJsonMaybe(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function fileSizeMaybe(filePath) {
  try {
    const info = await stat(filePath);
    return info.size;
  } catch {
    return null;
  }
}

function actionsFromSpecText(text) {
  const actions = new Set();
  for (const match of text.matchAll(/^\s*-\s*action:\s*["']?([A-Za-z]+)["']?\s*$/gm)) {
    if (match[1]) actions.add(match[1]);
  }
  return [...actions].sort((a, b) => a.localeCompare(b));
}

async function collectSpecEvidence(specPaths) {
  const specs = [];
  const allActions = new Set();
  let narrationCount = 0;

  for (const specPath of specPaths) {
    const text = await readFile(specPath, "utf8");
    const actions = actionsFromSpecText(text);
    const specNarrationCount = (text.match(/^\s*narration:\s*.+$/gm) ?? []).length;
    for (const action of actions) allActions.add(action);
    narrationCount += specNarrationCount;
    specs.push({ path: specPath, actions, narrationCount: specNarrationCount });
  }

  return {
    specs,
    actions: [...allActions].sort((a, b) => a.localeCompare(b)),
    narrationCount,
    missingActions: REQUIRED_DEMO_ACTIONS.filter((action) => !allActions.has(action)),
  };
}

function probeAudio(mp4Path) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=index",
      "-of",
      "json",
      mp4Path,
    ],
    { encoding: "utf8", windowsHide: true },
  );

  if (result.error || result.status !== 0) return null;
  try {
    const parsed = JSON.parse(result.stdout);
    return Array.isArray(parsed.streams) && parsed.streams.length > 0;
  } catch {
    return null;
  }
}

async function collectReviewArtifacts({ workspaceDir }) {
  const specPaths = await findFiles(
    path.join(workspaceDir, "demos"),
    (_filePath, name) => name.endsWith(".demo.yaml") || name.endsWith(".demo.yml"),
    3,
  );
  const outputRoot = path.join(workspaceDir, "demo-machine-output");
  const mp4Paths = await findFiles(outputRoot, (_filePath, name) => name === "output.mp4", 4);
  const selfEvaluationPath = path.join(workspaceDir, "SELF_EVALUATION.md");
  const specEvidence = await collectSpecEvidence(specPaths);

  const demos = [];
  for (const mp4Path of mp4Paths) {
    const dir = path.dirname(mp4Path);
    const qualityPath = path.join(dir, "quality.json");
    const verificationPath = path.join(dir, "verification.json");
    const eventsPath = path.join(dir, "events.json");
    const subtitlesPath = path.join(dir, "subtitles.vtt");
    const quality = await readJsonMaybe(qualityPath);
    const verification = await readJsonMaybe(verificationPath);
    const events = await readJsonMaybe(eventsPath);
    demos.push({
      slug: path.basename(dir),
      dir,
      mp4Path,
      mp4Size: await fileSizeMaybe(mp4Path),
      qualityPath: (await exists(qualityPath)) ? qualityPath : null,
      verificationPath: (await exists(verificationPath)) ? verificationPath : null,
      eventsPath: (await exists(eventsPath)) ? eventsPath : null,
      subtitlesPath: (await exists(subtitlesPath)) ? subtitlesPath : null,
      qualityStatus: quality?.status ?? quality?.summary?.status ?? "unknown",
      qualitySummary: quality?.summary ?? null,
      qualityHasFailures: quality?.hasFailures === true || quality?.status === "fail",
      verificationStatus: verification?.status ?? "unknown",
      eventCount: Array.isArray(events) ? events.length : null,
      hasAudio: probeAudio(mp4Path),
    });
  }

  const demosWithoutAudio = demos
    .filter((demo) => demo.hasAudio !== true)
    .map((demo) => demo.slug)
    .sort((a, b) => a.localeCompare(b));
  const demosWithoutSubtitles = demos
    .filter((demo) => !demo.subtitlesPath)
    .map((demo) => demo.slug)
    .sort((a, b) => a.localeCompare(b));
  const demosWithQualityFailures = demos
    .filter((demo) => demo.qualityHasFailures)
    .map((demo) => demo.slug)
    .sort((a, b) => a.localeCompare(b));
  const demosWithQualityWarnings = demos
    .filter((demo) => demo.qualityStatus === "warn")
    .map((demo) => demo.slug)
    .sort((a, b) => a.localeCompare(b));
  const acceptance = {
    status:
      demos.length >= 3 &&
      demosWithoutAudio.length === 0 &&
      demosWithoutSubtitles.length === 0 &&
      demosWithQualityFailures.length === 0 &&
      specEvidence.narrationCount > 0 &&
      specEvidence.missingActions.length === 0
        ? "pass"
        : "fail",
    requiredActions: REQUIRED_DEMO_ACTIONS,
    coveredActions: specEvidence.actions,
    missingActions: specEvidence.missingActions,
    narrationCount: specEvidence.narrationCount,
    demosWithoutAudio,
    demosWithoutSubtitles,
    demosWithQualityFailures,
    demosWithQualityWarnings,
    minimumDemoCount: 3,
  };

  return {
    specPaths,
    specs: specEvidence.specs,
    demos: demos.sort((a, b) => a.slug.localeCompare(b.slug)),
    acceptance,
    selfEvaluationPath: (await exists(selfEvaluationPath)) ? selfEvaluationPath : null,
  };
}

function relativeFrom(from, target) {
  return posixPath(path.relative(from, target));
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function writeReviewPage({ workspaceDir, outputDir, report }) {
  await mkdir(outputDir, { recursive: true });
  const reviewPath = path.join(outputDir, "review.html");
  const generatedAt = new Date().toISOString();
  const demoCards =
    report.demos.length === 0
      ? "<p>No rendered demos found yet. Run with <code>--run-codex</code>, then rerun <code>--review-only</code>.</p>"
      : report.demos
          .map((demo) => {
            const videoSrc = relativeFrom(outputDir, demo.mp4Path);
            const rows = [
              ["Quality", demo.qualityStatus],
              ["Verification", demo.verificationStatus],
              [
                "Audio",
                demo.hasAudio === true
                  ? "present"
                  : demo.hasAudio === false
                    ? "missing"
                    : "unknown",
              ],
              ["Subtitles", demo.subtitlesPath ? "present" : "missing"],
              ["Events", demo.eventCount ?? "unknown"],
              ["Size", formatBytes(demo.mp4Size)],
              ["Output", relativeFrom(workspaceDir, demo.dir)],
            ];
            return `<article class="card">
  <h2>${htmlEscape(demo.slug)}</h2>
  <video controls preload="metadata" src="${htmlEscape(videoSrc)}"></video>
  <dl>${rows
    .map(
      ([label, value]) => `<div><dt>${htmlEscape(label)}</dt><dd>${htmlEscape(value)}</dd></div>`,
    )
    .join("")}</dl>
</article>`;
          })
          .join("\n");

  const specs =
    report.specPaths.length === 0
      ? "<li>No specs found.</li>"
      : report.specPaths
          .map(
            (specPath) =>
              `<li><code>${htmlEscape(relativeFrom(workspaceDir, specPath))}</code></li>`,
          )
          .join("\n");
  const selfEvaluation = report.selfEvaluationPath
    ? `<p><a href="${htmlEscape(relativeFrom(outputDir, report.selfEvaluationPath))}">Open SELF_EVALUATION.md</a></p>`
    : "<p>SELF_EVALUATION.md was not found.</p>";
  const acceptanceRows = [
    ["Status", report.acceptance.status.toUpperCase()],
    [
      "Demos",
      `${String(report.demos.length)} / ${String(report.acceptance.minimumDemoCount)} minimum`,
    ],
    ["Narration Lines", report.acceptance.narrationCount],
    ["Covered Actions", report.acceptance.coveredActions.join(", ") || "none"],
    ["Missing Actions", report.acceptance.missingActions.join(", ") || "none"],
    ["Missing Audio", report.acceptance.demosWithoutAudio.join(", ") || "none"],
    ["Missing Subtitles", report.acceptance.demosWithoutSubtitles.join(", ") || "none"],
    ["Quality Failures", report.acceptance.demosWithQualityFailures.join(", ") || "none"],
    ["Quality Warnings", report.acceptance.demosWithQualityWarnings.join(", ") || "none"],
  ]
    .map(
      ([label, value]) => `<div><dt>${htmlEscape(label)}</dt><dd>${htmlEscape(value)}</dd></div>`,
    )
    .join("");

  await writeText(
    reviewPath,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Demo Machine Meta Prompt QA Review</title>
    <style>
      body {
        margin: 0;
        background: #f5f7fb;
        color: #172033;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main {
        width: min(1180px, calc(100% - 40px));
        margin: 0 auto;
        padding: 32px 0 46px;
      }

      header {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: end;
        margin-bottom: 22px;
      }

      h1 {
        margin: 0 0 8px;
        font-size: 30px;
      }

      .muted {
        color: #5c667a;
      }

      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
        gap: 18px;
      }

      .card,
      .panel {
        background: #ffffff;
        border: 1px solid #dbe4ef;
        border-radius: 8px;
        box-shadow: 0 1px 2px rgb(15 23 42 / 7%);
        padding: 16px;
      }

      video {
        width: 100%;
        aspect-ratio: 16 / 9;
        background: #111827;
        border-radius: 6px;
      }

      dl {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px 14px;
      }

      dt {
        color: #5c667a;
        font-size: 12px;
        text-transform: uppercase;
      }

      dd {
        margin: 2px 0 0;
        font-weight: 700;
      }

      code {
        word-break: break-word;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Meta Prompt QA Review</h1>
          <div class="muted">Generated ${htmlEscape(generatedAt)}</div>
        </div>
        <div class="muted">Workspace: <code>${htmlEscape(workspaceDir)}</code></div>
      </header>
      <section class="cards">${demoCards}</section>
      <section class="panel" style="margin-top: 18px">
        <h2>Acceptance</h2>
        <dl>${acceptanceRows}</dl>
        <h2>Generated Specs</h2>
        <ul>${specs}</ul>
        <h2>Self Evaluation</h2>
        ${selfEvaluation}
      </section>
    </main>
  </body>
</html>
`,
  );

  await writeText(
    path.join(outputDir, "meta-prompt-report.json"),
    `${JSON.stringify({ generatedAt, workspaceDir, ...report }, null, 2)}\n`,
  );

  return reviewPath;
}

async function runCodex({ root, workspaceDir, outputDir, model, codexCmd, build }) {
  if (build) {
    await runStep("build demo-machine", "pnpm", ["build"], { cwd: root });
  }

  const promptPath = path.join(workspaceDir, "META_PROMPT.md");
  const prompt = await readFile(promptPath, "utf8");
  const lastMessagePath = path.join(outputDir, "codex-last-message.txt");
  await mkdir(outputDir, { recursive: true });

  const args = [
    "exec",
    "--skip-git-repo-check",
    "--dangerously-bypass-approvals-and-sandbox",
    "-C",
    workspaceDir,
    "-o",
    lastMessagePath,
  ];
  if (model) args.push("--model", model);
  args.push("-");

  await runStep("codex meta prompt", codexCmd, args, { cwd: workspaceDir, input: prompt });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  let workspaceDir = path.resolve(root, opts.workspaceDir);
  const outputDir = path.resolve(root, opts.outputDir);

  if (!opts.reviewOnly) {
    const scaffold = await scaffoldWorkspace({
      root,
      workspaceDir,
      outputDir,
      clean: opts.clean,
    });
    workspaceDir = scaffold.workspaceDir;
    console.log("Meta prompt QA workspace ready.");
    console.log(`  Workspace: ${scaffold.workspaceDir}`);
    console.log(`  Prompt:    ${scaffold.promptPath}`);
  }

  if (opts.runCodex) {
    await runCodex({
      root,
      workspaceDir,
      outputDir,
      model: opts.model,
      codexCmd: opts.codexCmd,
      build: opts.build,
    });
  } else if (!opts.reviewOnly) {
    console.log("\nCodex was not run. Re-run with --run-codex to execute the agent lane.");
  }

  const report = await collectReviewArtifacts({ workspaceDir });
  const reviewPath = await writeReviewPage({ workspaceDir, outputDir, report });
  console.log(`\nReview page: ${reviewPath}`);
  console.log(`Specs:       ${report.specPaths.length}`);
  console.log(`Demos:       ${report.demos.length}`);
}

export {
  UsageError,
  collectReviewArtifacts,
  metaPrompt,
  needsShell,
  parseArgs,
  resolveCommand,
  scaffoldWorkspace,
  skillMarkdown,
  writeReviewPage,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    if (error instanceof UsageError) {
      console.error(`Error: ${error.message}`);
      process.exit(2);
    }
    console.error(error?.stack ?? String(error));
    process.exit(1);
  });
}
