import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanTitle, pageOf, publicDream } from "./lib/dreams.js";
import { JsonDreamStore } from "./lib/store.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number.parseInt(process.env.PORT || "4310", 10);
const host = process.env.HOST || "127.0.0.1";
const store = new JsonDreamStore({
  file: process.env.DREAM_DATA_FILE || path.join(root, ".data", "dreams.json"),
  seedFile: path.join(root, "server", "data", "dreams.seed.json"),
});

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function api(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/dream") {
    return json(response, 200, pageOf(store.all(), url.searchParams.get("page"), url.searchParams.get("limit")));
  }

  const renameMatch = url.pathname.match(/^\/api\/dream\/([a-zA-Z0-9_-]{1,120})\/title$/);
  if (request.method === "PUT" && renameMatch) {
    try {
      const body = await readJson(request);
      const title = cleanTitle(body.title);
      if (!title) return json(response, 400, { error: "title is required" });
      const updated = store.rename(renameMatch[1], title);
      return updated ? json(response, 200, publicDream(updated)) : json(response, 404, { error: "dream not found" });
    } catch (error) {
      return json(response, error.message === "request_too_large" ? 413 : 400, { error: "invalid request" });
    }
  }

  return json(response, 404, { error: "not found" });
}

function staticFile(response, url) {
  const dist = path.join(root, "dist");
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const resolved = path.resolve(dist, requested);
  const file = resolved.startsWith(`${dist}${path.sep}`) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()
    ? resolved
    : path.join(dist, "index.html");
  if (!fs.existsSync(file)) return json(response, 404, { error: "Run npm run build first." });
  response.writeHead(200, { "Content-Type": mimeTypes[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
  if (url.pathname.startsWith("/api/")) return api(request, response, url);
  return staticFile(response, url);
});

server.listen(port, host, () => {
  console.log(`Dream Journal API listening at http://${host}:${port}`);
});

