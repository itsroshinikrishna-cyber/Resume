# Roshini Krishna — Resume

A standalone, single-page web resume designed to live alongside the Framer portfolio at
[roshinikrishna.framer.website](https://roshinikrishna.framer.website/).

## What's here

```
index.html               ← the resume page (self-contained, no build step)
assets/headshot.jpg      ← portrait
assets/roshini-krishna-resume.pdf  ← original PDF backup (optional)
```

## "Download PDF" works via print

The **Download PDF** button calls `window.print()`. The page has a dedicated
`@media print` stylesheet that re-flows everything into a clean, document-feel
PDF — same content, same type, tighter margins, sized for US Letter.

To save: click the button → in the print dialog, set destination to **"Save as PDF"**.

## Deploy to Vercel (recommended)

1. Push this folder to a GitHub repo.
2. Go to [vercel.com/new](https://vercel.com/new), import the repo.
3. Framework preset: **Other** (no build step needed — it's a static site).
4. Click **Deploy**. You'll get a URL like `roshini-resume.vercel.app`.

## Embed on Framer

In Framer, change the existing **"Download Resume"** button so it opens the
Vercel URL in a new tab:

- **Link:** `https://your-vercel-url.vercel.app`
- **Open in:** New Tab
- **Label:** `Resume` (or keep "Download Resume")

That's it — visitors land on the styled page, and can hit **Download PDF** from there.

## Editing the content

Everything is in `index.html`. Search for section labels (`profile:`, `experience:`, etc.)
to find the right block. Update text directly — no framework, no build.
