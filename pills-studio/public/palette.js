/* Palette extraction: a port of the Android Palette API (median-cut quantizer + target scoring).
   Matches the "Palette Extractor" tool: 112x112 sample area, max 16 colours, default filter
   (skip near-black, near-white and the near-red "I line"). */
(function (root) {
  "use strict";
  const QUANT_BITS = 5, QUANT_SHIFT = 8 - QUANT_BITS;
  const BLACK_MAX_L = 0.05, WHITE_MIN_L = 0.95;

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    let h, s;
    if (d === 0) { h = s = 0; }
    else {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60;
    }
    h = (h + 360) % 360;
    return [h, s, l];
  }
  const hex = (r, g, b) => "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();

  function ignore(hsl) { // default filter
    const [h, s, l] = hsl;
    return l <= BLACK_MAX_L || l >= WHITE_MIN_L || (h >= 10 && h <= 37 && s <= 0.82);
  }
  const q5 = (r, g, b) => ((r >> QUANT_SHIFT) << 10) | ((g >> QUANT_SHIFT) << 5) | (b >> QUANT_SHIFT);
  const qr = c => (c >> 10) & 31, qg = c => (c >> 5) & 31, qb = c => c & 31;
  const to8 = v => v << QUANT_SHIFT;

  function swatch(r, g, b, pop) { return { r, g, b, pop, rgb: [r, g, b], hex: hex(r, g, b), hsl: rgbToHsl(r, g, b) }; }

  function quantize(data, maxColors) {
    const hist = new Int32Array(1 << 15);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      hist[q5(data[i], data[i + 1], data[i + 2])]++;
    }
    const colors = [];
    for (let c = 0; c < hist.length; c++) {
      if (hist[c] > 0) {
        if (ignore(rgbToHsl(to8(qr(c)), to8(qg(c)), to8(qb(c))))) hist[c] = 0; else colors.push(c);
      }
    }
    if (colors.length <= maxColors) return colors.map(c => swatch(to8(qr(c)), to8(qg(c)), to8(qb(c)), hist[c]));

    function Vbox(lower, upper) {
      this.lower = lower; this.upper = upper; this.fit();
    }
    Vbox.prototype.fit = function () {
      let minR = 255, minG = 255, minB = 255, maxR = 0, maxG = 0, maxB = 0, pop = 0;
      for (let i = this.lower; i <= this.upper; i++) {
        const c = colors[i]; pop += hist[c];
        const r = qr(c), g = qg(c), b = qb(c);
        if (r > maxR) maxR = r; if (r < minR) minR = r;
        if (g > maxG) maxG = g; if (g < minG) minG = g;
        if (b > maxB) maxB = b; if (b < minB) minB = b;
      }
      Object.assign(this, { minR, minG, minB, maxR, maxG, maxB, pop });
      this.volume = (maxR - minR + 1) * (maxG - minG + 1) * (maxB - minB + 1);
    };
    Vbox.prototype.canSplit = function () { return this.upper > this.lower; };
    Vbox.prototype.longest = function () {
      const r = this.maxR - this.minR, g = this.maxG - this.minG, b = this.maxB - this.minB;
      if (r >= g && r >= b) return 0; if (g >= r && g >= b) return 1; return 2;
    };
    const swap = (dim, lo, hi) => {
      if (dim === 1) for (let i = lo; i <= hi; i++) { const c = colors[i]; colors[i] = (qg(c) << 10) | (qr(c) << 5) | qb(c); }
      else if (dim === 2) for (let i = lo; i <= hi; i++) { const c = colors[i]; colors[i] = (qb(c) << 10) | (qg(c) << 5) | qr(c); }
    };
    Vbox.prototype.splitPoint = function () {
      const dim = this.longest();
      swap(dim, this.lower, this.upper);
      const part = colors.slice(this.lower, this.upper + 1).sort((a, b) => a - b);
      for (let i = 0; i < part.length; i++) colors[this.lower + i] = part[i];
      swap(dim, this.lower, this.upper);
      const mid = Math.floor(this.pop / 2);
      for (let i = this.lower, count = 0; i <= this.upper; i++) {
        count += hist[colors[i]];
        if (count >= mid) return Math.min(this.upper - 1, i);
      }
      return this.lower;
    };
    Vbox.prototype.split = function () {
      const sp = this.splitPoint(), nb = new Vbox(sp + 1, this.upper);
      this.upper = sp; this.fit(); return nb;
    };
    Vbox.prototype.average = function () {
      let tot = 0, rs = 0, gs = 0, bs = 0;
      for (let i = this.lower; i <= this.upper; i++) {
        const c = colors[i], p = hist[c]; tot += p; rs += p * qr(c); gs += p * qg(c); bs += p * qb(c);
      }
      return swatch(to8(Math.round(rs / tot)), to8(Math.round(gs / tot)), to8(Math.round(bs / tot)), tot);
    };

    const queue = [new Vbox(0, colors.length - 1)];
    while (queue.length < maxColors) {
      queue.sort((a, b) => b.volume - a.volume);
      const v = queue.shift();
      if (v && v.canSplit()) { queue.push(v.split()); queue.push(v); } else { if (v) queue.push(v); break; }
    }
    return queue.map(v => v.average()).filter(s => !ignore(s.hsl));
  }

  // [minSat, targetSat, maxSat], [minLight, targetLight, maxLight]
  const TARGETS = {
    lightVibrant: { s: [0.35, 1, 1], l: [0.55, 0.74, 1] },
    vibrant:      { s: [0.35, 1, 1], l: [0.3, 0.5, 0.7] },
    darkVibrant:  { s: [0.35, 1, 1], l: [0, 0.26, 0.45] },
    lightMuted:   { s: [0, 0.3, 0.4], l: [0.55, 0.74, 1] },
    muted:        { s: [0, 0.3, 0.4], l: [0.3, 0.5, 0.7] },
    darkMuted:    { s: [0, 0.3, 0.4], l: [0, 0.26, 0.45] },
  };
  const W_SAT = 0.24, W_LUMA = 0.52, W_POP = 0.24;

  function fromPixels(data, maxColors) {
    maxColors = maxColors || 16;
    const swatches = quantize(data, maxColors).sort((a, b) => b.pop - a.pop);
    const out = { swatches, dominant: swatches[0] || null };
    const maxPop = swatches.reduce((m, s) => Math.max(m, s.pop), 0) || 1;
    const used = new Set();
    for (const name of Object.keys(TARGETS)) {
      const t = TARGETS[name]; let best = null, bestScore = 0;
      for (const s of swatches) {
        const [, sat, l] = s.hsl;
        if (sat < t.s[0] || sat > t.s[2] || l < t.l[0] || l > t.l[2] || used.has(s.hex)) continue;
        const score = W_SAT * (1 - Math.abs(sat - t.s[1])) + W_LUMA * (1 - Math.abs(l - t.l[1])) + W_POP * (s.pop / maxPop);
        if (!best || score > bestScore) { best = s; bestScore = score; }
      }
      out[name] = best; if (best) used.add(best.hex);
    }
    const total = swatches.reduce((a, s) => a + s.pop, 0) || 1;
    swatches.forEach(s => s.share = s.pop / total);
    out.suggestions = suggest(out);
    return out;
  }

  /* Up to 3 distinct gradient colours, best first. White text sits on the gradient, so darker,
     well-populated and reasonably saturated colours rank higher. If the image has fewer than
     3 usable colours, darker variations of the best one fill the gaps. */
  const PROFILE_LABEL = { darkVibrant: "Dark Vibrant", vibrant: "Vibrant", darkMuted: "Dark Muted", muted: "Muted", lightVibrant: "Light Vibrant", lightMuted: "Light Muted", dominant: "Dominant" };
  function suggest(out) {
    const cands = [], seen = new Set();
    const add = (s, label) => { if (s && !seen.has(s.hex)) { seen.add(s.hex); cands.push({ s, label }); } };
    ["darkVibrant", "vibrant", "darkMuted", "muted", "dominant", "lightVibrant", "lightMuted"].forEach(k => add(out[k], PROFILE_LABEL[k]));
    out.swatches.forEach(s => add(s, "Palette colour"));
    const maxPop = out.swatches.reduce((m, s) => Math.max(m, s.pop), 0) || 1;
    const score = ({ s }) => {
      const sat = s.hsl[1], l = s.hsl[2];
      const dark = l <= 0.38 ? 1 : l >= 0.7 ? 0 : (0.7 - l) / 0.32;
      return (0.5 * dark + 0.3 * (s.pop / maxPop) + 0.2 * Math.min(1, sat / 0.6)) * (l < 0.12 ? 0.5 : 1);
    };
    cands.sort((a, b) => score(b) - score(a));
    const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    const picked = [];
    for (const c of cands) { if (picked.length < 3 && picked.every(p => dist(p.s, c.s) >= 48)) picked.push(c); }
    for (const c of cands) { if (picked.length < 3 && !picked.includes(c)) picked.push(c); }
    for (let k = 1; picked.length < 3 && picked.length > 0; k++) {
      const b = picked[0].s, f = 1 - 0.3 * k;
      picked.push({ s: swatch(Math.round(b.r * f), Math.round(b.g * f), Math.round(b.b * f), 0), label: "Darker" });
    }
    return picked.map(p => ({ r: p.s.r, g: p.s.g, b: p.s.b, rgb: p.s.rgb, hex: p.s.hex, label: p.label }));
  }

  // Browser: sample the image at ~112x112 area, like the Android default.
  function extract(img, maxColors, area) {
    area = area || 112 * 112;
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    const k = w0 * h0 > area ? Math.sqrt(area / (w0 * h0)) : 1;
    const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return fromPixels(ctx.getImageData(0, 0, w, h).data, maxColors);
  }

  const Palette = { extract, fromPixels, rgbToHsl, NAMES: ["dominant", "darkVibrant", "vibrant", "lightVibrant", "darkMuted", "muted", "lightMuted"] };
  if (typeof module !== "undefined" && module.exports) module.exports = Palette; else root.Palette = Palette;
})(typeof window !== "undefined" ? window : globalThis);
