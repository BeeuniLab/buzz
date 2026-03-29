# Usage

- **Entry:** `src/code.html` — single-file creative canvas (HTML + CSS + JS). Rendered in **browser** mode.
- **Host API:** Use `window.lib` for persistence, leaderboard, and asset helpers; local dev uses `lib/host-stub.js`.
- **Metadata:** Edit `src/context_meta.json` for title and project config; use `src/asset_map.json` when you map asset IDs to URLs.
- **Build / deploy:** From the template root, `npm run build` then `npm run deploy` (Wrangler) as documented in the reference README.

Keep all logic in the client bundle; avoid embedding third-party boilerplate or external branded starter text in shipped metadata.
