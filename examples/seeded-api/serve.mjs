import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = 4584;

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".txt": "text/plain",
};

/** In-memory notes store — reset on each server start. */
let notes = [];

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
  });
}

const server = createServer(async (req, res) => {
  // POST /api/seed — replace notes store
  if (req.url === "/api/seed" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw);
      notes = Array.isArray(body.notes) ? body.notes.map(String) : [];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, count: notes.length }));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
    }
    return;
  }

  // GET /api/notes — return current notes
  if (req.url === "/api/notes" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ count: notes.length, notes }));
    return;
  }

  // Static file serving
  const url = req.url === "/" ? "/index.html" : req.url;
  const filePath = join(__dirname, url);
  const ext = extname(filePath);

  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "text/plain" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`SeededAPI app running at http://localhost:${PORT}`);
});
