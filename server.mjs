import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { handlePresence } from "./lib/presence.mjs";
import { createStore, openDatabase } from "./lib/sqlite-store.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8080;
const dataDir = process.env.DATA_DIR || "/data";
const indexPath = join(root, "index.html");
const MAX_BODY = 32 * 1024;

const db = openDatabase(dataDir);
const store = createStore(db);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        fail(Object.assign(new Error("too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", fail);
  });
}

function send(res, status, body, type) {
  if (res.headersSent) return;
  const payload = Buffer.from(body);
  res.writeHead(status, {
    "content-type": type,
    "content-length": payload.length,
    "cache-control": "no-store",
  });
  res.end(payload);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), "application/json; charset=utf-8");
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const html = await readFile(indexPath);
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-length": html.length,
        "cache-control": "no-cache",
      });
      res.end(html);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/api/presence") {
      if (req.method !== "POST") {
        send(res, 405, "Method not allowed", "text/plain; charset=utf-8");
        return;
      }
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch (error) {
        if (error.status === 413) {
          sendJson(res, 413, { error: "State too large" });
          return;
        }
        sendJson(res, 400, { error: "Invalid JSON" });
        return;
      }
      const result = await handlePresence(body, store);
      sendJson(res, result.status, result.json);
      return;
    }
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Server error" });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Boulderhalle hört auf :${port}, Daten in ${dataDir}`);
});

function shutdown() {
  server.close(() => {
    try {
      db.close();
    } catch (error) {
      console.error(error);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
