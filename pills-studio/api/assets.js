// Shared image / mascot / generated-image library.
import { putFile, listPrefix, removePath } from "./_store.js";
import { auth, fail, slug, rand, stamp } from "./_util.js";

const KINDS = ["image", "mascot", "generated"];
const MIME = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MAX_BYTES = 4 * 1024 * 1024;

export function toItem(b) {
  const [, kind] = b.pathname.split("/");
  const base = b.pathname.split("/").pop().replace(/\.[a-z0-9]+$/, "").replace(/^[a-z0-9]+-[a-z0-9]{4}-/, "");
  return { id: b.pathname, url: b.url, kind, name: base, size: b.size, uploadedAt: b.uploadedAt };
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const kind = req.query?.kind;
      if (!KINDS.includes(kind)) return fail(res, "Unknown kind");
      const items = (await listPrefix(`assets/${kind}/`)).map(toItem);
      items.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      res.setHeader("cache-control", "no-store");
      return res.status(200).json({ items });
    }

    if (!auth(req, res)) return;

    if (req.method === "POST") {
      const { kind, name, dataUrl } = req.body || {};
      if (kind !== "image" && kind !== "mascot") return fail(res, "Unknown kind");
      const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
      if (!m) return fail(res, "Upload a PNG, JPG, WebP or GIF image");
      const buf = Buffer.from(m[2], "base64");
      if (buf.length > MAX_BYTES) return fail(res, "Image is too large (max 4 MB)", 413);
      const clean = String(name || "untitled").replace(/\.[a-z0-9]+$/i, "");
      const pathname = `assets/${kind}/${stamp()}-${rand()}-${slug(clean)}.${MIME[m[1]]}`;
      const saved = await putFile(pathname, buf, m[1]);
      return res.status(201).json(toItem({ ...saved, size: buf.length, uploadedAt: new Date().toISOString() }));
    }

    if (req.method === "DELETE") {
      const id = String(req.query?.id || "");
      if (!/^assets\/(image|mascot|generated)\/[a-z0-9._-]+$/.test(id)) return fail(res, "Bad id");
      await removePath(id);
      return res.status(200).json({ ok: true });
    }

    return fail(res, "Method not allowed", 405);
  } catch (e) {
    console.error(e);
    return fail(res, "Library error", 500);
  }
}
