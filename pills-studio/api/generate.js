// Image generation. Default provider: OpenAI Images (gpt-image-1).
// Env: OPENAI_API_KEY (required), IMAGE_MODEL, IMAGE_QUALITY (low|medium|high).
// MOCK_GENERATE=1 returns a placeholder (local testing only).
import { putFile } from "./_store.js";
import { auth, fail, slug, rand, stamp } from "./_util.js";
import { toItem } from "./assets.js";

const BLOB_HOST = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//;
const TREATMENTS = ["contrejour", "playful", "hero"];

async function callOpenAI({ prompt, refs }) {
  const model = process.env.IMAGE_MODEL || "gpt-image-1";
  const quality = process.env.IMAGE_QUALITY || "medium";
  const headers = { authorization: `Bearer ${process.env.OPENAI_API_KEY}` };
  let r;
  if (refs.length) {
    const fd = new FormData();
    fd.set("model", model); fd.set("prompt", prompt); fd.set("size", "1024x1536"); fd.set("quality", quality);
    for (const u of refs) {
      const ir = await fetch(u); if (!ir.ok) throw new Error("Could not load a reference image");
      fd.append("image[]", new Blob([await ir.arrayBuffer()], { type: ir.headers.get("content-type") || "image/png" }), "ref.png");
    }
    r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers, body: fd });
  } else {
    r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ model, prompt, size: "1024x1536", quality, n: 1 }),
    });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `Image provider error (${r.status})`);
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image provider returned no image");
  return { buffer: Buffer.from(b64, "base64"), type: "image/png", ext: "png" };
}

function mock(treatment) {
  const hue = { contrejour: "#2f6f5e", playful: "#e4572e", hero: "#c9b28a" }[treatment] || "#6b3df0";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hue}"/><stop offset="1" stop-color="#111"/></linearGradient></defs><rect width="1024" height="1536" fill="url(#g)"/><circle cx="512" cy="560" r="230" fill="rgba(255,255,255,.25)"/><text x="512" y="1000" font-size="54" fill="#fff" text-anchor="middle" font-family="sans-serif">MOCK ${treatment.toUpperCase()}</text></svg>`;
  return { buffer: Buffer.from(svg), type: "image/svg+xml", ext: "svg" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, "Method not allowed", 405);
  if (!auth(req, res)) return;
  try {
    const { treatment, prompt, refs = [], label } = req.body || {};
    if (!TREATMENTS.includes(treatment)) return fail(res, "Unknown treatment");
    if (typeof prompt !== "string" || prompt.trim().length < 10 || prompt.length > 4000) return fail(res, "Prompt must be 10–4000 characters");
    const safeRefs = (Array.isArray(refs) ? refs : []).slice(0, 3).filter(u => BLOB_HOST.test(String(u)));

    let out;
    if (process.env.OPENAI_API_KEY) out = await callOpenAI({ prompt, refs: safeRefs });
    else if (process.env.MOCK_GENERATE) out = mock(treatment);
    else return fail(res, "Image generation is not configured (set OPENAI_API_KEY)", 501);

    const pathname = `assets/generated/${stamp()}-${rand()}-${slug(label || treatment)}.${out.ext}`;
    const saved = await putFile(pathname, out.buffer, out.type);
    return res.status(201).json(toItem({ ...saved, size: out.buffer.length, uploadedAt: new Date().toISOString() }));
  } catch (e) {
    console.error(e);
    return fail(res, e.message || "Generation failed", 502);
  }
}
