// Local dev server: serves public/, runs api/*.js, stores data in ./.data
// Usage: node dev-server.js   (add MOCK_GENERATE=1 to test generation without a provider key)
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(root, "public"), DATA = path.join(root, ".data");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".json": "application/json" };

async function sendFile(res, base, rel) {
  const file = path.resolve(base, "." + path.posix.normalize("/" + rel));
  if (!file.startsWith(base + path.sep)) { res.statusCode = 403; return res.end(); }
  try {
    const buf = await fs.readFile(file);
    res.setHeader("content-type", MIME[path.extname(file)] || "application/octet-stream");
    res.setHeader("access-control-allow-origin", "*");
    res.end(buf); return true;
  } catch { return false; }
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); };
  try {
    if (u.pathname.startsWith("/api/")) {
      const name = u.pathname.slice(5).replace(/[^a-z0-9_-]/gi, "");
      const mod = await import(pathToFileURL(path.join(root, "api", name + ".js")));
      req.query = Object.fromEntries(u.searchParams);
      const chunks = []; for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString();
      try { req.body = raw ? JSON.parse(raw) : undefined; } catch { return res.status(400).json({ error: "Bad JSON" }); }
      return await mod.default(req, res);
    }
    if (u.pathname.startsWith("/files/")) { if (await sendFile(res, DATA, u.pathname.slice(7))) return; }
    else {
      let p = u.pathname === "/" ? "/index.html" : u.pathname;
      if (!path.extname(p)) p += ".html";
      if (await sendFile(res, PUB, p)) return;
    }
    res.statusCode = 404; res.end("Not found");
  } catch (e) { console.error(e); res.statusCode = 500; res.end("Server error"); }
}).listen(process.env.PORT || 3000, () => console.log("Pills Studio on http://localhost:" + (process.env.PORT || 3000)));
