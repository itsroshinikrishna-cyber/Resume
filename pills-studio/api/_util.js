import crypto from "node:crypto";

// Writes (and image generation) require the team passcode when STUDIO_PASSCODE is set.
export function auth(req, res) {
  const need = process.env.STUDIO_PASSCODE;
  if (!need) return true;
  const got = String(req.headers["x-passcode"] || "");
  const a = Buffer.from(got), b = Buffer.from(need);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  res.status(401).json({ error: "Passcode required" });
  return false;
}

export const fail = (res, msg, code = 400) => res.status(code).json({ error: msg });

export const slug = (s, max = 40) =>
  String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, max) || "untitled";

export const rand = () => Math.random().toString(36).slice(2, 6).padEnd(4, "0");
export const stamp = () => Date.now().toString(36);
