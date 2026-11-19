// Storage adapter. Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production),
// otherwise a local ./.data folder (dev server only).
import fs from "node:fs/promises";
import path from "node:path";

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const blob = useBlob ? await import("@vercel/blob") : null;
const DATA = path.join(process.cwd(), ".data");

export const mode = useBlob ? "blob" : "local";

export async function putFile(pathname, buffer, contentType) {
  if (useBlob) {
    const r = await blob.put(pathname, buffer, {
      access: "public", contentType, addRandomSuffix: false, allowOverwrite: false,
    });
    return { pathname: r.pathname, url: r.url };
  }
  const file = path.join(DATA, pathname);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buffer);
  return { pathname, url: "/files/" + pathname };
}

export async function listPrefix(prefix) {
  if (useBlob) {
    const out = []; let cursor;
    do {
      const r = await blob.list({ prefix, cursor, limit: 1000 });
      for (const b of r.blobs) out.push({ pathname: b.pathname, url: b.url, size: b.size, uploadedAt: new Date(b.uploadedAt).toISOString() });
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    return out;
  }
  const out = [];
  async function walk(dir) {
    let entries; try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else {
        const pathname = path.relative(DATA, full).split(path.sep).join("/");
        if (pathname.startsWith(prefix)) { const st = await fs.stat(full); out.push({ pathname, url: "/files/" + pathname, size: st.size, uploadedAt: st.mtime.toISOString() }); }
      }
    }
  }
  await walk(DATA);
  return out;
}

export async function readJson(item) {
  if (useBlob) { const r = await fetch(item.url); if (!r.ok) throw new Error("read failed"); return r.json(); }
  return JSON.parse(await fs.readFile(path.join(DATA, item.pathname), "utf8"));
}

export async function removePath(pathname) {
  if (useBlob) {
    const items = await listPrefix(pathname);
    const urls = items.filter(i => i.pathname === pathname).map(i => i.url);
    if (urls.length) await blob.del(urls);
    return;
  }
  await fs.rm(path.join(DATA, pathname), { force: true });
}

export const DATA_DIR = DATA;
