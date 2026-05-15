# Usage

- **Entry:** `src/code.html` — single-file creative canvas (HTML + CSS + JS). Rendered in **browser** mode.
- **Host API:** Use `window.lib` for persistence, leaderboard, and asset helpers; local dev uses `lib/host-stub.js`.
- **Config:** Edit `src/config` for project parameters; use `src/asset_map` to map asset IDs to URLs.
- **Build / deploy:** From the template root, `npm run build` then `npm run deploy` (Wrangler) as documented in the reference README.

Keep all logic in the client bundle; avoid embedding third-party boilerplate or external branded starter text in shipped metadata.
Keep every readable label legible in the 9:16 mobile preview without zooming. At 720x1280 canvas resolution, use at least 34px for status text, at least 40px for instructions and button labels, and at least 56px for titles, result messages, or primary calls to action. Shorten copy before reducing type size.
