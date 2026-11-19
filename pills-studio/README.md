# Pills Studio

Static tool for building Glance chat starter pills to the visual system.

- **Formats:** image 9:16 (170x310), image 4:5 (170x212), prompt 1:1 (170x170). Exports at 4x.
- **Image cards:** upload/drop/paste an image, drag to reposition, bottom gradient auto-matches the image,
  DM Sans (semibold + black), bottom-left or bottom-right text only, max 7 words, square corners.
- **Prompt cards:** mascot + question on one of the four brand colours. Upload mascot PNGs to build a library.
- **Treatments** (contre-jour close-ups, playful portraits, hero still life) show their rules and build an image-model prompt.
- Cards are saved in the browser (localStorage). "Download all" gives a ZIP of PNGs.

## Deploy on Vercel
No build step. Import the repo, set **Root Directory** to `pills-studio`, framework preset **Other**.
