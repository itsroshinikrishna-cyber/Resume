# Pills Studio

Team tool for making Glance chat starter pills to the visual system. Three pages:

| Page | What it does |
|---|---|
| **Studio** (`/`) | Build cards. Anyone can upload or pick an image, edit the copy, choose a mascot, and export PNGs. Cards are shared: everyone sees and can edit the same set. |
| **Library** (`/library`) | Image dashboard and mascot dashboard (plus everything generated). Anyone can upload, reuse, copy links or delete. |
| **Generate** (`/generate`) | Pick one of the three photo pills, fill in its focus, review the prompt and generate images. Results are saved to the Library and can be sent straight to the Studio. |

The three pills, each with a different focus:
1. **Contre-jour beauty close-ups**: light and texture (premium, cinematic)
2. **Playful conceptual portraits**: expression and twist (fun, human)
3. **Hero product still life**: product and place (clean, product-led)

Card rules are built in: 9:16 (170x310), 4:5 (170x212) and 1:1 prompt cards (170x170), DM Sans semibold/black,
bottom-left or bottom-right text only, max 7 words, square corners, four brand colours. PNGs export at 4x.

## Deploy on Vercel
1. Import the repo, set **Root Directory** to `pills-studio`, framework preset **Other** (no build step).
2. **Storage → Create → Blob** and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`, which turns on the shared library and shared cards.
3. Add environment variables:
   - `OPENAI_API_KEY`: switches on image generation (model `gpt-image-1`; override with `IMAGE_MODEL`, quality with `IMAGE_QUALITY`).
   - `STUDIO_PASSCODE` *(recommended)*: when set, uploads, edits, deletes and generation need this passcode (people are asked once per browser). Viewing stays open.
4. Redeploy. Also consider Vercel **Deployment Protection** (SSO) so only your team can open the site.

Without Blob configured the Studio still works, saving cards in each person's own browser only.

## Run locally
```bash
cd pills-studio
MOCK_GENERATE=1 node dev-server.js   # http://localhost:3000, data in ./.data, placeholder "generated" images
```

## Notes
- Cards use last-save-wins: if two people edit the same card at once, the later save replaces the earlier one.
- Generation goes through `api/generate.js`. To use another image model, replace `callOpenAI` there.
