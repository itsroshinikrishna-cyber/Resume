/* Shared client code for Studio, Library and Generate. Exposes window.PS */
window.PS = (function () {
  "use strict";
  const LS_PASS = "pillsStudio.pass";

  /* ---------- API ---------- */
  async function api(path, opts = {}) {
    const headers = {}; let body;
    if (opts.body !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(opts.body); }
    const pass = localStorage.getItem(LS_PASS); if (pass) headers["x-passcode"] = pass;
    const r = await fetch(path, { method: opts.method || "GET", headers, body });
    if (r.status === 401 && !opts._retry) {
      const p = prompt("This studio is protected. Enter the team passcode:");
      if (p) { localStorage.setItem(LS_PASS, p); return api(path, { ...opts, _retry: true }); }
    }
    let data = null; try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw Object.assign(new Error((data && data.error) || "Request failed (" + r.status + ")"), { status: r.status });
    return data;
  }
  let cfgP;
  const config = () => cfgP || (cfgP = api("/api/config").catch(() => ({ offline: true })));

  /* ---------- Images ---------- */
  function readFile(file, max, type) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { const im = new Image(); im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height));
        const c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        res(type === "png" ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", .9));
      }; im.onerror = () => rej(new Error("Not a valid image")); im.src = fr.result; };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  async function uploadFile(kind, file) {
    if (!file || !file.type.startsWith("image/")) throw new Error("Please choose an image file");
    const dataUrl = await readFile(file, kind === "mascot" ? 512 : 1600, kind === "mascot" ? "png" : "jpg");
    const cfg = await config();
    if (cfg.offline) return { url: dataUrl, name: file.name, kind, offline: true };
    return api("/api/assets", { method: "POST", body: { kind, name: file.name, dataUrl } });
  }
  async function listAssets(kind) {
    const cfg = await config(); if (cfg.offline) return [];
    return (await api("/api/assets?kind=" + kind)).items;
  }

  /* ---------- UI helpers ---------- */
  const style = document.createElement("style");
  style.textContent = `
  .ps-nav{display:flex;gap:2px}
  .ps-nav a{padding:8px 14px;font-weight:700;font-size:13px;color:#15131a;text-decoration:none;border-bottom:3px solid transparent}
  .ps-nav a:hover{background:#f1eef8}
  .ps-nav a.on{border-bottom-color:#6b3df0}
  .ps-modal{position:fixed;inset:0;background:rgba(10,8,16,.6);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px}
  .ps-box{background:#fff;width:min(900px,100%);max-height:88vh;display:flex;flex-direction:column;border:1px solid #15131a}
  .ps-head{display:flex;gap:8px;align-items:center;padding:12px 14px;border-bottom:1px solid #dcd8e4}
  .ps-btn{border:1px solid #15131a;background:#fff;padding:6px 10px;font:inherit;font-weight:600;font-size:13px;cursor:pointer}
  .ps-btn:hover{background:#eee}
  .ps-grid{padding:14px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
  .ps-cell{border:1px solid #dcd8e4;background:#fff;padding:0;cursor:pointer;text-align:left;font:inherit}
  .ps-cell:hover{border-color:#6b3df0;outline:1px solid #6b3df0}
  .ps-cell .t{aspect-ratio:3/4;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/16px 16px;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .ps-cell .t img{width:100%;height:100%;object-fit:contain;display:block}
  .ps-cell .n{font-size:11px;padding:5px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#6c6877}
  .ps-empty{grid-column:1/-1;color:#6c6877;padding:30px;text-align:center}
  #ps-toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#15131a;color:#fff;padding:8px 14px;font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none;z-index:60}
  #ps-toast.show{opacity:1}`;
  document.head.appendChild(style);

  function nav(active) {
    const n = document.getElementById("nav"); if (!n) return;
    n.className = "ps-nav";
    n.innerHTML = [["studio", "./", "Studio"], ["bulk", "bulk", "Bulk"], ["library", "library", "Library"], ["generate", "generate", "Generate"]]
      .map(([k, h, t]) => `<a href="${h}" class="${k === active ? "on" : ""}">${t}</a>`).join("");
  }
  let toastT;
  function toast(m) {
    let t = document.getElementById("ps-toast");
    if (!t) { t = document.createElement("div"); t.id = "ps-toast"; document.body.appendChild(t); }
    t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600);
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* Modal picker: resolves with an asset item, or null */
  function pickAsset(kinds, title) {
    kinds = [].concat(kinds);
    return new Promise(resolve => {
      const wrap = document.createElement("div"); wrap.className = "ps-modal";
      wrap.innerHTML = `<div class="ps-box"><div class="ps-head"><b>${esc(title || "Choose")}</b><span style="flex:1"></span>
        <button class="ps-btn" data-up>Upload new</button><button class="ps-btn" data-x>Close</button></div><div class="ps-grid"></div></div>`;
      document.body.appendChild(wrap);
      const grid = wrap.querySelector(".ps-grid"), file = document.createElement("input");
      file.type = "file"; file.accept = "image/*"; file.multiple = true;
      const done = v => { wrap.remove(); resolve(v); };
      wrap.addEventListener("click", e => { if (e.target === wrap || e.target.closest("[data-x]")) done(null); });
      async function load() {
        grid.innerHTML = '<div class="ps-empty">Loading…</div>';
        let items = [];
        try { items = (await Promise.all(kinds.map(listAssets))).flat().sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)); }
        catch (e) { grid.innerHTML = `<div class="ps-empty">${esc(e.message)}</div>`; return; }
        if (!items.length) { grid.innerHTML = '<div class="ps-empty">Nothing here yet. Use “Upload new”.</div>'; return; }
        grid.innerHTML = "";
        for (const it of items) {
          const b = document.createElement("button"); b.className = "ps-cell";
          b.innerHTML = `<div class="t"><img loading="lazy" src="${esc(it.url)}" alt=""></div><div class="n">${esc(it.name)}</div>`;
          b.onclick = () => done(it); grid.appendChild(b);
        }
      }
      wrap.querySelector("[data-up]").onclick = () => file.click();
      file.onchange = async () => {
        const files = [...file.files]; if (!files.length) return;
        try {
          const kind = kinds.includes("mascot") ? "mascot" : "image", ups = [];
          for (const f of files) ups.push(await uploadFile(kind, f));
          if (ups[0] && ups[0].offline) return done(ups[0]);
          toast(files.length + " uploaded"); if (files.length === 1) return done(ups[0]); await load();
        } catch (e) { toast(e.message); }
      };
      load();
    });
  }

  /* ---------- Strategy: treatments + prompt builders ---------- */
  function nameColor(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (d < .08) return l > .8 ? "off-white" : l < .2 ? "near-black" : "neutral grey";
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const names = [[15, "red"], [40, "orange"], [65, "yellow"], [95, "lime green"], [160, "green"], [190, "teal"], [250, "blue"], [290, "purple"], [335, "pink"], [361, "red"]];
    return (l < .28 ? "deep " : l > .7 ? "soft " : "") + names.find(n => h < n[0])[1];
  }
  const colorPhrase = hex => `${nameColor(hex)} (${hex})`;
  const RATIO = {
    image9: "vertical 9:16 portrait composition",
    image45: "vertical 4:5 portrait composition, keeping the key subject inside the central 80% of the width",
  };
  const CAST = {
    female: "The model is a woman.",
    male: "The model is a man.",
    neutral: "Casting is open; avoid gendered styling cues.",
  };
  const FOOTER = "Keep the bottom 35% of the frame calm and uncluttered so overlay text stays readable.";
  const NO_TEXT = "No text, letters, logos, watermarks or UI anywhere in the image.";

  const TREATMENTS = {
    contrejour: {
      name: "Contre-jour beauty close-ups",
      focus: "Light & texture",
      blurb: "Tight, backlit macro crops of the moment a product is used. Premium and cinematic.",
      style: "Tight, backlit macro crop of the moment the product is used, with the model partly cropped and one element catching the light.",
      rules: ["One macro crop and one action per image", "One gradient colour per category, falling to dark at the edges", "A thin rim light with a soft fill so skin and texture stay readable", "Consistent 9:16 or 4:5 ratio"],
      fields: [
        { k: "subject", label: "Product & moment", ph: "Hydrating serum pressed onto the cheekbone" },
        { k: "crop", label: "Macro crop", type: "select", opts: ["Jawline & cheek", "Hands & product", "Lips", "Eyes & brow", "Hair & scalp", "Neck & shoulder"] },
        { k: "light", label: "Backlight", type: "select", opts: ["Golden-hour rim light", "Cool window backlight", "Warm studio rim light"] },
        { k: "color", label: "Category gradient colour", type: "color", def: "#2f6f5e" },
      ],
      build: (v, c) => [
        `Photograph for a shopping-app starter card, ${RATIO[c.ratio]}.`,
        `Contre-jour beauty close-up: a tight, backlit macro crop of the ${(v.crop || "").toLowerCase()} at the moment of use. ${v.subject || "[product and moment]"}${c.category ? ` (category: ${c.category})` : ""}.`,
        CAST[c.segment],
        `${v.light || "Golden-hour rim light"} traces a thin rim light along the edges, with a soft fill so skin and texture stay readable. Exactly one element catches the light.`,
        `One ${colorPhrase(v.color || "#2f6f5e")} colour gradient fills the frame and falls to dark at the edges.`,
        "The model is partly cropped. One macro crop, one action. Realistic skin texture, shallow depth of field.",
        FOOTER, NO_TEXT,
      ].join("\n"),
    },
    playful: {
      name: "Playful conceptual portraits",
      focus: "Expression & twist",
      blurb: "Full-face model caught mid-action with the product as a prop and one unexpected twist. Fun and human.",
      style: "Full-face model caught mid-action with the product as a prop and one unexpected twist, shot with direct flash on a flat, saturated backdrop.",
      rules: ["One full-face model, one twist per image", "One bold backdrop colour per category", "Direct flash with a realistic, unretouched feel", "Consistent 9:16 or 4:5 ratio"],
      fields: [
        { k: "subject", label: "Product used as a prop", ph: "Face-wash tube held in the teeth" },
        { k: "action", label: "Expression / action", ph: "Squinting and grinning mid-laugh" },
        { k: "twist", label: "The one unexpected twist", ph: "Tube is held like a cigar" },
        { k: "color", label: "Backdrop colour (flat, saturated)", type: "color", def: "#1f5fd6" },
      ],
      build: (v, c) => [
        `Photograph for a shopping-app starter card, ${RATIO[c.ratio]}.`,
        `Playful conceptual portrait: a full-face portrait of the model caught mid-action. ${v.action || "[expression and action]"}.`,
        CAST[c.segment],
        `The product is a prop: ${v.subject || "[product]"}${c.category ? ` (category: ${c.category})` : ""}. One unexpected twist: ${v.twist || "[twist]"}.`,
        `Direct on-camera flash with hard shadows and a realistic, unretouched feel (visible skin texture, no heavy retouching), against a flat, saturated ${colorPhrase(v.color || "#1f5fd6")} seamless backdrop.`,
        "One full-face model only. One twist only.",
        FOOTER, NO_TEXT,
      ].join("\n"),
    },
    hero: {
      name: "Hero product still life",
      focus: "Product & place",
      blurb: "The product is the hero, shot on location in natural light with no model. Clean and product-led.",
      style: "The product is the hero, shot on location in natural light with no model competing for attention.",
      rules: ["One hero product or small group per image, in a real-world scene", "Essentials carry the mock \"bloom\" brand so they read as a product line", "Accessories and other products stay completely unbranded", "Consistent 9:16 or 4:5 ratio"],
      fields: [
        { k: "subject", label: "Hero product (or small group)", ph: "Amber serum bottle next to a folded towel" },
        { k: "scene", label: "Real-world scene", ph: "Bathroom windowsill with a plant and tiled wall" },
        { k: "light", label: "Natural light", type: "select", opts: ["Soft morning window light", "Warm late-afternoon sun", "Bright overcast daylight", "Dappled shade"] },
        { k: "brand", label: "Branding", type: "select", opts: ["Essential: mock \"bloom\" brand", "Accessory / other: completely unbranded"] },
      ],
      build: (v, c) => {
        const bloom = (v.brand || "").startsWith("Essential");
        return [
          `Photograph for a shopping-app starter card, ${RATIO[c.ratio]}.`,
          `Hero product still life shot on location. ${v.subject || "[hero product]"}${c.category ? ` (category: ${c.category})` : ""}, placed naturally in this scene: ${v.scene || "[real-world scene]"}.`,
          `${v.light || "Soft morning window light"}. No people, hands or models; the product is the only hero.`,
          bloom ? 'The packaging carries a fictional "bloom" wordmark so it reads as a house product line. No other brand names.'
                : "Every product is completely unbranded: no logos, wordmarks or readable labels.",
          "Editorial, realistic, shallow depth of field.",
          FOOTER, bloom ? "No other text, watermarks or UI anywhere in the image." : NO_TEXT,
        ].join("\n");
      },
    },
  };
  function buildPrompt(treatment, values, common) { return TREATMENTS[treatment].build(values || {}, common); }
  function defaults(treatment) {
    const v = {}; for (const f of TREATMENTS[treatment].fields) v[f.k] = f.type === "select" ? f.opts[0] : f.def || ""; return v;
  }

  /* ---------- Copy hierarchy ----------
     One full line  ->  small line above / headline / small line below.
       "Find matcha mask for your skin"  ->  Find | Matcha mask | For your skin
       "Gift ideas that don't get regifted" ->  - | Gift ideas | That don't get regifted
       "Build my fragrance"              ->  Build my | Fragrance | -
     Lead-ins (kicker) and qualifier starters (subline) come from the visual-system examples. */
  const LEADS = ["build my", "find", "shop", "discover", "get", "the", "your", "my"];
  const SUB_STARTS = ["for", "that", "to", "with", "without", "under", "in", "on", "so", "like", "when", "from", "by", "if"];
  function splitCopy(text) {
    const w = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    if (!w.length) return { kicker: "", headline: "", sub: "" };
    const low = w.map(x => x.toLowerCase().replace(/[.,!?:;]+$/, ""));
    let start = 0;
    for (const lead of LEADS) {                       // longest lead-ins listed first
      const n = lead.split(" ").length;
      if (low.slice(0, n).join(" ") === lead && w.length > n) { start = n; break; }
    }
    let end = w.length;
    for (let j = start + 1; j < w.length; j++) if (SUB_STARTS.includes(low[j])) { end = j; break; }
    return { kicker: w.slice(0, start).join(" "), headline: w.slice(start, end).join(" "), sub: w.slice(end).join(" ") };
  }
  const wc = s => String(s || "").trim().split(/\s+/).filter(Boolean).length;
  function copyIssues(c, max) {
    const out = [], total = wc(c.kicker) + wc(c.headline) + wc(c.sub);
    if (total > (max || 7)) out.push(`${total} words (max ${max || 7})`);
    if (wc(c.headline) > 4) out.push("Headline is long; the big text may wrap to 3+ lines");
    return out;
  }

  return { api, config, readFile, uploadFile, listAssets, pickAsset, nav, toast, esc, TREATMENTS, buildPrompt, defaults, nameColor, splitCopy, copyIssues };
})();
