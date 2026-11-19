// Shared cards. Each save writes a new immutable version `cards/<id>/<ts>.json`
// and removes older ones (avoids CDN-cache staleness from overwriting a file).
import { putFile, listPrefix, readJson, removePath } from "./_store.js";
import { auth, fail } from "./_util.js";

const ID = /^[a-z0-9]{4,20}$/;
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const str = (v, n) => String(v ?? "").slice(0, n);
const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const url = v => { v = String(v || ""); return v.length <= 800 && (v.startsWith("https://") || v.startsWith("/files/")) ? v : ""; };

export function sanitize(c) {
  return {
    id: c.id,
    type: oneOf(c.type, ["image9", "image45", "prompt"], "image9"),
    segment: oneOf(c.segment, ["female", "male", "neutral"], "neutral"),
    category: str(c.category, 60),
    treatment: oneOf(c.treatment, ["contrejour", "playful", "hero"], "contrejour"),
    kicker: str(c.kicker, 60), headline: str(c.headline, 120), sub: str(c.sub, 80),
    align: oneOf(c.align, ["left", "right"], "left"),
    img: url(c.img),
    zoom: num(c.zoom, 1, 3, 1), ox: num(c.ox, -1, 1, 0), oy: num(c.oy, -1, 1, 0),
    scrimSource: oneOf(c.scrimSource, ["sugg1", "sugg2", "sugg3", "dominant", "darkVibrant", "vibrant", "lightVibrant", "darkMuted", "muted", "lightMuted", "custom"], "sugg1"),
    scrimColor: /^#[0-9a-fA-F]{6}$/.test(c.scrimColor) ? c.scrimColor : "#20483a",
    scrimH: num(c.scrimH, 25, 80, 55),
    question: str(c.question, 200), subtext: str(c.subtext, 40),
    palette: oneOf(c.palette, ["purple", "pink", "blue", "yellow"], "purple"),
    mascot: url(c.mascot),
    createdAt: num(c.createdAt, 0, 9e15, Date.now()),
  };
}

async function allVersions(id) {
  return (await listPrefix(`cards/${id}/`)).sort((a, b) => a.pathname.localeCompare(b.pathname));
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const items = await listPrefix("cards/");
      const latest = new Map();
      for (const it of items) {
        const id = it.pathname.split("/")[1];
        if (!latest.has(id) || it.pathname > latest.get(id).pathname) latest.set(id, it);
      }
      const cards = (await Promise.all([...latest.values()].map(it => readJson(it).catch(() => null)))).filter(Boolean);
      cards.sort((a, b) => b.createdAt - a.createdAt);
      res.setHeader("cache-control", "no-store");
      return res.status(200).json({ cards });
    }

    if (!auth(req, res)) return;

    if (req.method === "PUT") {
      const c = req.body?.card;
      if (!c || !ID.test(c.id || "")) return fail(res, "Bad card");
      const card = { ...sanitize(c), updatedAt: Date.now() };
      const old = await allVersions(card.id);
      await putFile(`cards/${card.id}/${String(card.updatedAt).padStart(15, "0")}.json`, Buffer.from(JSON.stringify(card)), "application/json");
      await Promise.all(old.map(o => removePath(o.pathname)));
      return res.status(200).json({ card });
    }

    if (req.method === "DELETE") {
      const id = String(req.query?.id || "");
      if (!ID.test(id)) return fail(res, "Bad id");
      await Promise.all((await allVersions(id)).map(o => removePath(o.pathname)));
      return res.status(200).json({ ok: true });
    }

    return fail(res, "Method not allowed", 405);
  } catch (e) {
    console.error(e);
    return fail(res, "Cards error", 500);
  }
}
